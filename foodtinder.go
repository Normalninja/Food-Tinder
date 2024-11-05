package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sort"
	"sync"
)

const apiKey = "YOUR_GOOGLE_PLACES_API_KEY"

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

func addUserToSession(sessionID, userID string) {
	mu.Lock()
	defer mu.Unlock()
	if session, exists := sessionData[sessionID]; exists {
		session.Members = append(session.Members, userID)
	} else {
		sessionData[sessionID] = &Session{
			AgreedPlaces: make(map[string]map[string]bool),
			Members:      []string{userID},
		}
	}
	fmt.Printf("User %s added to session %s. Current members: %v\n", userID, sessionID, sessionData[sessionID].Members)
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

func createSessionWithParameters(sessionID string, distance, price int, rating float64, latitude, longitude float64) error {
	places, err := getNearbyPlaces(latitude, longitude, distance, price, rating)
	if err != nil {
		return err
	}

	mu.Lock()
	defer mu.Unlock()
	sessionData[sessionID] = &Session{
		Places: places,
		Parameters: Parameters{
			Distance: distance,
			Price:    price,
			Rating:   rating,
		},
		AgreedPlaces: make(map[string]map[string]bool),
		Members:      []string{},
	}
	return nil
}

func trackUserAgreement(sessionID, userID, placeID string) {
	mu.Lock()
	defer mu.Unlock()
	session, exists := sessionData[sessionID]
	if !exists {
		return
	}
	if _, exists := session.AgreedPlaces[placeID]; !exists {
		session.AgreedPlaces[placeID] = make(map[string]bool)
	}
	session.AgreedPlaces[placeID][userID] = true
}

func showConsensus(sessionID string) {
	mu.Lock()
	defer mu.Unlock()
	session, exists := sessionData[sessionID]
	if !exists {
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

	fmt.Println("Consensus List:")
	for _, pa := range placeAgreement {
		place := findPlaceByID(session.Places, pa.PlaceID)
		if place != nil {
			fmt.Printf("%s - %.0f%% agreed\n", place.Name, pa.Agreement)
		}
	}
}

func findPlaceByID(places []Place, placeID string) *Place {
	for _, place := range places {
		if place.PlaceID == placeID {
			return &place
		}
	}
	return nil
}

func saveList(sessionID string) error {
	mu.Lock()
	defer mu.Unlock()
	session, exists := sessionData[sessionID]
	if !exists {
		return fmt.Errorf("session %s not found", sessionID)
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

	file, err := os.Create("consensus_list.txt")
	if err != nil {
		return fmt.Errorf("failed to create file: %v", err)
	}
	defer file.Close()

	for _, pa := range placeAgreement {
		place := findPlaceByID(session.Places, pa.PlaceID)
		if place != nil {
			_, err := file.WriteString(fmt.Sprintf("%s - %.0f%% agreed\n", place.Name, pa.Agreement))
			if err != nil {
				return fmt.Errorf("failed to write to file: %v", err)
			}
		}
	}

	fmt.Println("Consensus list saved to consensus_list.txt")
	return nil
}

func main() {
	// Example usage
	sessionID := "session1"
	userID := "user1"
	latitude := 37.7749
	longitude := -122.4194

	addUserToSession(sessionID, userID)
	err := createSessionWithParameters(sessionID, 1000, 2, 4.0, latitude, longitude)
	if err != nil {
		fmt.Printf("Error creating session: %v\n", err)
		return
	}

	trackUserAgreement(sessionID, userID, "place1")
	showConsensus(sessionID)
	err = saveList(sessionID)
	if err != nil {
		fmt.Printf("Error saving list: %v\n", err)
	}
}
