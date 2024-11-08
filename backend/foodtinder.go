package main

import (
    "encoding/json"
    "fmt"
    "io/ioutil"
    "log"
    "net/http"
    "sync"

    "gopkg.in/yaml.v2"
)

type Config struct {
    GoogleAPIKey string `yaml:"GoogleAPIKey"`
}

var apiKey string
var sessionData = make(map[string]*Session)
var mu sync.Mutex

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

func loadConfig() {
    data, err := ioutil.ReadFile("secrets.yaml")
    if err != nil {
        log.Fatalf("error: %v", err)
    }

    var config Config
    err = yaml.Unmarshal(data, &config)
    if err != nil {
        log.Fatalf("error: %v", err)
    }

    apiKey = config.GoogleAPIKey
}

func createSessionWithParameters(w http.ResponseWriter, r *http.Request) {
    var req struct {
        SessionID string     `json:"session_id"`
        Distance  int        `json:"distance"`
        Price     int        `json:"price"`
        Rating    float64    `json:"rating"`
        Latitude  float64    `json:"latitude"`
        Longitude float64    `json:"longitude"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    // Fetch nearby places from Google Places API
    places, err := fetchNearbyPlaces(req.Latitude, req.Longitude, req.Distance, req.Price, req.Rating)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    mu.Lock()
    defer mu.Unlock()

    sessionData[req.SessionID] = &Session{
        Places:       places,
        CurrentIndex: 0,
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

func fetchNearbyPlaces(latitude, longitude float64, distance, price int, rating float64) ([]Place, error) {
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
        Results []struct {
            PlaceID string `json:"place_id"`
            Name    string `json:"name"`
        } `json:"results"`
    }
    if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
        return nil, fmt.Errorf("failed to decode response: %v", err)
    }

    places := make([]Place, len(result.Results))
    for i, r := range result.Results {
        places[i] = Place{
            PlaceID: r.PlaceID,
            Name:    r.Name,
        }
    }

    return places, nil
}

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

func getNearbyPlaces(w http.ResponseWriter, r *http.Request) {
    sessionID := r.URL.Query().Get("session_id")
    userID := r.URL.Query().Get("user_id")

    // Use sessionID and userID if necessary
    fmt.Printf("Session ID: %s, User ID: %s\n", sessionID, userID)

    mu.Lock()
    defer mu.Unlock()

    session, exists := sessionData[sessionID]
    if (!exists) {
        http.Error(w, "Session not found", http.StatusNotFound)
        return
    }

    response := struct {
        Places []Place `json:"places"`
    }{
        Places: session.Places,
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
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

func trackUserAgreement(w http.ResponseWriter, r *http.Request) {
    var req struct {
        SessionID string `json:"session_id"`
        UserID    string `json:"user_id"`
        PlaceID   string `json:"place_id"`
        Liked     bool   `json:"liked"`
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

    if session.AgreedPlaces == nil {
        session.AgreedPlaces = make(map[string]map[string]bool)
    }

    if session.AgreedPlaces[req.PlaceID] == nil {
        session.AgreedPlaces[req.PlaceID] = make(map[string]bool)
    }

    session.AgreedPlaces[req.PlaceID][req.UserID] = req.Liked
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
        http.Error(w, "Session not found", http.StatusNotFound)
        return
    }

    // Calculate consensus based on session data
    consensus := []struct {
        Name      string `json:"name"`
        Agreement int    `json:"agreement"`
    }{}

    for _, place := range session.Places {
        agreedCount := 0
        for _, liked := range session.AgreedPlaces[place.PlaceID] {
            if liked {
                agreedCount++
            }
        }
        agreement := (agreedCount * 100) / len(session.Members)
        consensus = append(consensus, struct {
            Name      string `json:"name"`
            Agreement int    `json:"agreement"`
        }{
            Name:      place.Name,
            Agreement: agreement,
        })
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(consensus)
}

func enableCors(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Access-Control-Allow-Origin", "*")
        w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
        if r.Method == "OPTIONS" {
            return
        }
        next.ServeHTTP(w, r)
    })
}

func main() {
    loadConfig()

    mux := http.NewServeMux()
    mux.HandleFunc("/createSessionWithParameters", createSessionWithParameters)
    mux.HandleFunc("/addUserToSession", addUserToSession)
    mux.HandleFunc("/getNearbyPlaces", getNearbyPlaces)
    mux.HandleFunc("/getPlaceDetails", getPlaceDetails)
    mux.HandleFunc("/trackUserAgreement", trackUserAgreement)
    mux.HandleFunc("/showConsensus", showConsensus)

    fmt.Println("Server started at :8080")
    http.ListenAndServe(":8080", enableCors(mux))
}
