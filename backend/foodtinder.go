package main

import (
    "encoding/json"
    "fmt"
    "net/http"
    "sort"
    "sync"
    "io/ioutil"
)

const apiKey = "AIzaSyCCC1oe7EGG850oDzmwKcn5gd1c62ukxUc"

type Place struct {
    PlaceID string `json:"place_id"`
    Name    string `json:"name"`
}

type Session struct {
    Places       []Place
    CurrentIndex int
    Parameters   Parameters
    AgreedPlaces map[string]map[string]bool
    Members      []string
}

type Parameters struct {
    Distance int
    Price    int
    Rating   float64
}

var sessionData = make(map[string]*Session)
var mu sync.Mutex

func addUserToSession(w http.ResponseWriter, r *http.Request) {
    var req struct {
        SessionID string `json:"session_id"`
        UserID    string `json:"user_id"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    mu.Lock()
    defer mu.Unlock()

    session, exists := sessionData[req.SessionID]
    if !exists {
        http.Error(w, "Session not found", http.StatusNotFound)
        return
    }

    session.Members = append(session.Members, req.UserID)
    w.WriteHeader(http.StatusOK)
}

func getNearbyPlaces(latitude, longitude float64, distance, price int, rating float64) ([]Place, error) {
    location := fmt.Sprintf("%f,%f", latitude, longitude)
    url := fmt.Sprintf("https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=%s&radius=%d&minprice=%d&rating=%f&type=restaurant&key=%s",
        location, distance, price, rating, apiKey)

    resp, err := http.Get(url)
    if err != nil {
        return nil, fmt.Errorf("failed to fetch places: %v", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("failed to fetch places: status code %d", resp.StatusCode)
    }

    var result struct {
        Results []Place `json:"results"`
    }
    if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
        return nil, fmt.Errorf("failed to decode response: %v", err)
    }

    return result.Results, nil
}

func createSessionWithParameters(w http.ResponseWriter, r *http.Request) {
    var req struct {
        SessionID string  `json:"session_id"`
        Distance  int     `json:"distance"`
        Price     int     `json:"price"`
        Rating    float64 `json:"rating"`
        Latitude  float64 `json:"latitude"`
        Longitude float64 `json:"longitude"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    places, err := getNearbyPlaces(req.Latitude, req.Longitude, req.Distance, req.Price, req.Rating)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    mu.Lock()
    defer mu.Unlock()
    sessionData[req.SessionID] = &Session{
        Places: places,
        Parameters: Parameters{
            Distance: req.Distance,
            Price:    req.Price,
            Rating:   req.Rating,
        },
        AgreedPlaces: make(map[string]map[string]bool),
        Members:      []string{},
    }
    w.WriteHeader(http.StatusOK)
}

func trackUserAgreement(w http.ResponseWriter, r *http.Request) {
    var req struct {
        SessionID string `json:"session_id"`
        UserID    string `json:"user_id"`
        PlaceID   string `json:"place_id"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    mu.Lock()
    defer mu.Unlock()

    session, exists := sessionData[req.SessionID]
    if (!exists) {
        http.Error(w, "Session not found", http.StatusNotFound)
        return
    }

    if session.AgreedPlaces == nil {
        session.AgreedPlaces = make(map[string]map[string]bool)
    }

    if session.AgreedPlaces[req.PlaceID] == nil {
        session.AgreedPlaces[req.PlaceID] = make(map[string]bool)
    }

    session.AgreedPlaces[req.PlaceID][req.UserID] = true
    w.WriteHeader(http.StatusOK)
}

func showConsensus(w http.ResponseWriter, r *http.Request) {
    var req struct {
        SessionID string `json:"session_id"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    mu.Lock()
    defer mu.Unlock()
    session, exists := sessionData[req.SessionID]
    if !exists {
        http.Error(w, "session not found", http.StatusNotFound)
        return
    }

    totalMembers := len(session.Members)
    placeAgreement := make([]struct {
        PlaceID   string
        Agreement float64
    }, 0)

    for placeID, users := range session.AgreedPlaces {
        agreement := float64(len(users)) / float64(totalMembers) * 100
        placeAgreement = append(placeAgreement, struct {
            PlaceID   string
            Agreement float64
        }{PlaceID: placeID, Agreement: agreement})
    }

    // Sort by agreement percentage in descending order
    sort.Slice(placeAgreement, func(i, j int) bool {
        return placeAgreement[i].Agreement > placeAgreement[j].Agreement
    })

    response := make([]struct {
        Name      string  `json:"name"`
        Agreement float64 `json:"agreement"`
    }, 0)

    for _, pa := range placeAgreement {
        place := findPlaceByID(session.Places, pa.PlaceID)
        if place != nil {
            response = append(response, struct {
                Name      string  `json:"name"`
                Agreement float64 `json:"agreement"`
            }{Name: place.Name, Agreement: pa.Agreement})
        }
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}

func findPlaceByID(places []Place, placeID string) *Place {
    for _, place := range places {
        if place.PlaceID == placeID {
            return &place
        }
    }
    return nil
}

func getPlaceDetails(w http.ResponseWriter, r *http.Request) {
    placeID := r.URL.Query().Get("place_id")
    if placeID == "" {
        http.Error(w, "place_id is required", http.StatusBadRequest)
        return
    }

    url := fmt.Sprintf("https://maps.googleapis.com/maps/api/place/details/json?place_id=%s&key=%s", placeID, apiKey)
    resp, err := http.Get(url)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    defer resp.Body.Close()

    body, err := ioutil.ReadAll(resp.Body)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    w.Write(body)
}

func main() {
    http.HandleFunc("/addUserToSession", addUserToSession)
    http.HandleFunc("/createSessionWithParameters", createSessionWithParameters)
    http.HandleFunc("/trackUserAgreement", trackUserAgreement)
    http.HandleFunc("/showConsensus", showConsensus)
    http.HandleFunc("/getPlaceDetails", getPlaceDetails)

    fmt.Println("Server started at :8080")
    http.ListenAndServe(":8080", nil)
}
