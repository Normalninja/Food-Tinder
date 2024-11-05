package main

import (
	"encoding/json"
	"io/ioutil"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

var samplePlaces = []Place{
	{PlaceID: "place1", Name: "McDonald's"},
	{PlaceID: "place2", Name: "Wendy's"},
	{PlaceID: "place3", Name: "Burger King"},
	{PlaceID: "place4", Name: "Subway"},
	{PlaceID: "place5", Name: "KFC"},
	{PlaceID: "place6", Name: "Taco Bell"},
	{PlaceID: "place7", Name: "Pizza Hut"},
	{PlaceID: "place8", Name: "Domino's Pizza"},
	{PlaceID: "place9", Name: "Chick-fil-A"},
	{PlaceID: "place10", Name: "Panda Express"},
}

func TestAddUserToSession(t *testing.T) {
	sessionID := "session1"
	userID := "user1"
	addUserToSession(sessionID, userID)
	if _, exists := sessionData[sessionID]; !exists {
		t.Errorf("Session %s not found", sessionID)
	}
	if !contains(sessionData[sessionID].Members, userID) {
		t.Errorf("User %s not found in session %s", userID, sessionID)
	}
}

func contains(slice []string, item string) bool {
	for _, v := range slice {
		if v == item {
			return true
		}
	}
	return false
}

func TestGetNearbyPlaces(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"results": samplePlaces,
		})
	}))
	defer server.Close()

	originalURL := "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
	defer func() { apiURL = originalURL }()
	apiURL = server.URL

	latitude := 37.7749
	longitude := -122.4194
	places, err := getNearbyPlaces(latitude, longitude, 1000, 2, 4.0)
	if err != nil {
		t.Fatalf("Failed to get nearby places: %v", err)
	}
	if len(places) != len(samplePlaces) {
		t.Errorf("Expected %d places, got %d", len(samplePlaces), len(places))
	}
	if places[0].Name != "McDonald's" {
		t.Errorf("Expected first place to be McDonald's, got %s", places[0].Name)
	}
}

func TestCreateSessionWithParameters(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"results": samplePlaces,
		})
	}))
	defer server.Close()

	originalURL := "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
	defer func() { apiURL = originalURL }()
	apiURL = server.URL

	sessionID := "session1"
	latitude := 37.7749
	longitude := -122.4194
	err := createSessionWithParameters(sessionID, 1000, 2, 4.0, latitude, longitude)
	if err != nil {
		t.Fatalf("Failed to create session: %v", err)
	}
	if _, exists := sessionData[sessionID]; !exists {
		t.Errorf("Session %s not found", sessionID)
	}
	if sessionData[sessionID].Parameters.Distance != 1000 {
		t.Errorf("Expected distance to be 1000, got %d", sessionData[sessionID].Parameters.Distance)
	}
	if sessionData[sessionID].Parameters.Price != 2 {
		t.Errorf("Expected price to be 2, got %d", sessionData[sessionID].Parameters.Price)
	}
	if sessionData[sessionID].Parameters.Rating != 4.0 {
		t.Errorf("Expected rating to be 4.0, got %f", sessionData[sessionID].Parameters.Rating)
	}
}

func TestTrackUserAgreement(t *testing.T) {
	sessionID := "session1"
	userID := "user1"
	placeID := "place1"
	sessionData[sessionID] = &Session{
		Places:       samplePlaces,
		CurrentIndex: 0,
		Parameters:   Parameters{Distance: 1000, Price: 2, Rating: 4.0},
		AgreedPlaces: make(map[string]map[string]bool),
		Members:      []string{userID},
	}
	trackUserAgreement(sessionID, userID, placeID)
	if _, exists := sessionData[sessionID].AgreedPlaces[placeID]; !exists {
		t.Errorf("Place %s not found in agreed places", placeID)
	}
	if !sessionData[sessionID].AgreedPlaces[placeID][userID] {
		t.Errorf("User %s not found in agreed places for place %s", userID, placeID)
	}
}

func TestShowConsensus(t *testing.T) {
	sessionID := "session1"
	userID := "user1"
	placeID := "place1"
	sessionData[sessionID] = &Session{
		Places:       samplePlaces,
		CurrentIndex: 0,
		Parameters:   Parameters{Distance: 1000, Price: 2, Rating: 4.0},
		AgreedPlaces: map[string]map[string]bool{placeID: {userID: true}},
		Members:      []string{userID},
	}
	showConsensus(sessionID)
	// Since showConsensus prints the output, we can't directly test it.
	// Instead, we can check if the function runs without errors.
}

func TestSaveList(t *testing.T) {
	sessionID := "session1"
	userID := "user1"
	placeID := "place1"
	sessionData[sessionID] = &Session{
		Places:       samplePlaces,
		CurrentIndex: 0,
		Parameters:   Parameters{Distance: 1000, Price: 2, Rating: 4.0},
		AgreedPlaces: map[string]map[string]bool{placeID: {userID: true}},
		Members:      []string{userID},
	}
	err := saveList(sessionID)
	if err != nil {
		t.Fatalf("Failed to save list: %v", err)
	}
	content, err := ioutil.ReadFile("consensus_list.txt")
	if err != nil {
		t.Fatalf("Failed to read file: %v", err)
	}
	expectedContent := "McDonald's - 100% agreed\n"
	if string(content) != expectedContent {
		t.Errorf("Expected file content to be %q, got %q", expectedContent, string(content))
	}
	os.Remove("consensus_list.txt")
}
