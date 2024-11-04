import unittest
from unittest.mock import patch, MagicMock
from foodtinder import add_user_to_session, FoodMatchApp, session_data

class TestFoodTinder(unittest.TestCase):

    def setUp(self):
        self.app = FoodMatchApp()
        self.app.build()

    def test_add_user_to_session(self):
        session_id = "session1"
        user_id = "user1"
        add_user_to_session(session_id, user_id)
        self.assertIn(session_id, session_data)
        self.assertIn(user_id, session_data[session_id]["members"])

    @patch('foodtinder.requests.get')
    def test_get_nearby_places(self, mock_get):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"results": [{"name": "Place1"}]}
        mock_get.return_value = mock_response

        self.app.latitude = 37.7749
        self.app.longitude = -122.4194
        places = self.app.get_nearby_places(1000, 2, 4.0)
        self.assertIsNotNone(places)
        self.assertEqual(len(places), 1)
        self.assertEqual(places[0]["name"], "Place1")

    @patch('foodtinder.FoodMatchApp.get_nearby_places')
    @patch('foodtinder.FoodMatchApp.generate_qr_code')
    def test_create_session_with_parameters(self, mock_generate_qr_code, mock_get_nearby_places):
        mock_get_nearby_places.return_value = [{"place_id": "place1", "name": "Place1"}]
        self.app.create_session_with_parameters(1000, 2, 4.0)
        session_id = list(session_data.keys())[0]
        self.assertIn(session_id, session_data)
        self.assertEqual(session_data[session_id]["parameters"]["distance"], 1000)
        self.assertEqual(session_data[session_id]["parameters"]["price"], 2)
        self.assertEqual(session_data[session_id]["parameters"]["rating"], 4.0)

    @patch('foodtinder.FoodMatchApp.get_nearby_places')
    def test_update_session_parameters(self, mock_get_nearby_places):
        session_id = "session1"
        session_data[session_id] = {
            "places": [],
            "current_index": 0,
            "parameters": {"distance": 1000, "price": 2, "rating": 4.0},
            "agreed_places": {},
            "members": []
        }
        mock_get_nearby_places.return_value = [{"place_id": "place1", "name": "Place1"}]
        self.app.update_session_parameters(session_id, distance=2000)
        self.assertEqual(session_data[session_id]["parameters"]["distance"], 2000)
        self.assertEqual(session_data[session_id]["places"][0]["name"], "Place1")

    def test_track_user_agreement(self):
        session_id = "session1"
        user_id = "user1"
        place_id = "place1"
        session_data[session_id] = {
            "places": [{"place_id": place_id, "name": "Place1"}],
            "current_index": 0,
            "parameters": {"distance": 1000, "price": 2, "rating": 4.0},
            "agreed_places": {},
            "members": [user_id]
        }
        self.app.track_user_agreement(session_id, user_id, place_id)
        self.assertIn(place_id, session_data[session_id]["agreed_places"])
        self.assertIn(user_id, session_data[session_id]["agreed_places"][place_id])

    def test_show_consensus(self):
        session_id = "session1"
        user_id = "user1"
        place_id = "place1"
        session_data[session_id] = {
            "places": [{"place_id": place_id, "name": "Place1"}],
            "current_index": 0,
            "parameters": {"distance": 1000, "price": 2, "rating": 4.0},
            "agreed_places": {place_id: {user_id}},
            "members": [user_id]
        }
        self.app.show_consensus(session_id)
        consensus_screen = self.app.root.get_screen('consensus')
        consensus_list = consensus_screen.ids.consensus_list
        self.assertEqual(len(consensus_list.children), 1)
        self.assertEqual(consensus_list.children[0].text, "Place1")

if __name__ == '__main__':
    unittest.main()