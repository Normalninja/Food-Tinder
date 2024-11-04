import requests
from kivy.lang import Builder
from kivy.uix.screenmanager import Screen, ScreenManager
from kivy.uix.boxlayout import BoxLayout
from kivymd.app import MDApp
from kivymd.uix.card import MDCard
from kivy.animation import Animation
from kivy.utils import platform
from plyer import gps
import qrcode

# Dictionary to store session data
session_data = {}

def add_user_to_session(session_id, user_id):
    """Add a user to a session."""
    if session_id in session_data:
        session_data[session_id]["members"].append(user_id)
    else:
        session_data[session_id] = {"session_id": session_id, "members": [user_id]}
    print(f"User {user_id} added to session {session_id}. Current members: {session_data[session_id]['members']}")

# Kivy layout definition
KV = '''
ScreenManager:
    MenuScreen:
    ParameterScreen:
    SessionScreen:
    MainScreen:
    ConsensusScreen:

<MenuScreen>:
    name: 'menu'
    BoxLayout:
        orientation: 'vertical'
        MDLabel:
            text: "Welcome to Food Match!"
            halign: 'center'
            font_style: "H5"
        MDRaisedButton:
            text: "Create Session"
            on_release: app.go_to_parameters()
        MDRaisedButton:
            text: "Join Session"
            on_release: app.join_session()

<ParameterScreen>:
    name: 'parameters'
    BoxLayout:
        orientation: 'vertical'
        padding: 20
        MDTextField:
            id: distance
            hint_text: "Enter Distance (in km)"
            input_filter: "int"
        MDTextField:
            id: price
            hint_text: "Enter Price Level (0-4)"
            input_filter: "int"
        MDTextField:
            id: rating
            hint_text: "Minimum Rating (1.0 - 5.0)"
            input_filter: "float"
        MDRaisedButton:
            text: "Generate Session"
            on_release: app.create_session_with_parameters(distance.text, price.text, rating.text)

<SessionScreen>:
    name: 'session'
    BoxLayout:
        orientation: 'vertical'
        padding: 20
        MDLabel:
            id: session_info
            text: "Session Created! Show this QR code to others."
            halign: 'center'
            font_style: "H5"
        Image:
            id: qr_image
            size_hint_y: 0.6
            source: ""  # Dynamically set source in the app
        MDRaisedButton:
            text: "Proceed to Food Selection"
            pos_hint: {"center_x": 0.5}
            on_release: app.go_to_food_selection()

<FoodCard>:
    size_hint: None, None
    size: 300, 400
    pos_hint: {"center_x": .5, "center_y": .5}
    md_bg_color: 0.5, 0.5, 0.5, 1
    elevation: 8
    on_touch_move: app.on_card_swipe(self, *args)
    on_touch_up: app.on_card_release(self, *args)
    BoxLayout:
        orientation: "vertical"
        Image:
            id: food_image
            size_hint_y: 0.8
        MDLabel:
            id: food_name
            halign: "center"

<MainScreen>:
    name: "main"
    BoxLayout:
        orientation: "vertical"
        padding: 20
        MDLabel:
            text: "Swipe on Nearby Food Choices"
            halign: "center"
            font_style: "H5"
        FoodCard:
            id: food_card
        MDRaisedButton:
            text: "Show QR Code"
            pos_hint: {"center_x": 0.5}
            on_release: app.show_session_qr_code()

<ConsensusScreen>:
    name: "consensus"
    BoxLayout:
        orientation: "vertical"
        padding: 20
        MDLabel:
            text: "Agreed Places"
            halign: "center"
            font_style: "H5"
        ScrollView:
            BoxLayout:
                id: consensus_list
                orientation: "vertical"
'''

API_KEY = "YOUR_GOOGLE_PLACES_API_KEY"
android.permissions = ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION

class FoodMatchApp(MDApp):
    def build(self):
        """Build the Kivy application."""
        return Builder.load_string(KV)

    def on_start(self):
        """Configure and start GPS updates on application start."""
        try:
            gps.configure(on_location=self.on_location, on_status=self.on_status)
            gps.start(minTime=1000, minDistance=1)
        except NotImplementedError:
            print("GPS is not implemented on this platform.")
        except Exception as e:
            print(f"Error starting GPS: {e}")

        # Initialize location variables
        self.latitude = None
        self.longitude = None

    def on_location(self, **kwargs):
        """Callback for GPS location updates."""
        self.latitude = kwargs.get("lat")
        self.longitude = kwargs.get("lon")
        print(f"Location obtained: {self.latitude}, {self.longitude}")

    def on_status(self, stype, status):
        """Callback for GPS status updates."""
        print(f"GPS status update: {stype}, {status}")

    def get_nearby_places(self, distance, price, rating):
        """Fetch nearby places using Google Places API."""
        # Check if location is available
        if self.latitude is None or self.longitude is None:
            print("Waiting for location data...")
            return None

        # Use phone's GPS coordinates
        location = f"{self.latitude},{self.longitude}"
        url = f"https://maps.googleapis.com/maps/api/place/nearbysearch/json?location={location}&radius={distance}&minprice={price}&rating={rating}&type=restaurant&key={API_KEY}"
        
        try:
            response = requests.get(url)
            response.raise_for_status()
            return response.json().get("results")
        except requests.RequestException as e:
            print(f"Failed to fetch places: {e}")
            return None

    def create_session_with_parameters(self, distance, price, rating):
        """Create a session with the given parameters."""
        # Validate inputs
        if not distance or not price or not rating:
            print("All fields are required.")
            return
        
        # Fetch nearby places based on parameters
        nearby_places = self.get_nearby_places(int(distance), int(price), float(rating))
        
        # Process the results
        if nearby_places:
            session_id = self.generate_session_id()
            self.generate_qr_code(session_id)  # Generate QR code for session ID
            self.root.get_screen('session').ids.qr_image.source = "session_qr.png"
            self.root.get_screen('session').ids.session_info.text = f"Session Created! ID: {session_id}"
            self.root.current = 'session'
            
            # Store the places and parameters in session data
            session_data[session_id] = {
                "places": nearby_places,
                "current_index": 0,
                "parameters": {
                    "distance": distance,
                    "price": price,
                    "rating": rating
                },
                "agreed_places": {},
                "members": []
            }

    def update_session_parameters(self, session_id, distance=None, price=None, rating=None):
        """Update session parameters and notify users."""
        session = session_data.get(session_id)
        if session:
            if distance is not None:
                session["parameters"]["distance"] = distance
            if price is not None:
                session["parameters"]["price"] = price
            if rating is not None:
                session["parameters"]["rating"] = rating
            
            # Fetch updated places based on new parameters
            updated_places = self.get_nearby_places(
                int(session["parameters"]["distance"]),
                int(session["parameters"]["price"]),
                float(session["parameters"]["rating"])
            )
            if updated_places:
                session["places"] = updated_places
                session["current_index"] = 0  # Reset index
                self.notify_users(session_id)

    def notify_users(self, session_id):
        """Notify all users in the session about the parameter changes."""
        session = session_data.get(session_id)
        if session:
            # For simplicity, we just print the notification
            # In a real application, you might send a message to each user
            print(f"Session {session_id} parameters updated. Notifying users: {session['members']}")

    def generate_session_id(self):
        """Generate a unique session ID."""
        import uuid
        return str(uuid.uuid4())

    def generate_qr_code(self, session_id):
        """Generate a QR code for the session ID."""
        try:
            qr = qrcode.make(session_id)
            qr.save("session_qr.png")
            print("QR Code generated and saved as session_qr.png")
        except Exception as e:
            print(f"Failed to generate QR code: {e}")

    def go_to_parameters(self):
        """Navigate to the parameters screen."""
        self.root.current = 'parameters'

    def go_to_food_selection(self):
        """Navigate to the food selection screen."""
        session_id = self.root.get_screen('session').ids.session_info.text.split(": ")[1]
        self.update_food_card(session_id)
        self.root.current = 'main'

    def show_session_qr_code(self):
        """Show the session QR code screen."""
        self.root.current = 'session'

    def update_food_card(self, session_id):
        """Update the FoodCard with the current place's photo and name."""
        session = session_data.get(session_id)
        if session:
            places = session["places"]
            current_index = session["current_index"]
            if current_index < len(places):
                place = places[current_index]
                photo_reference = place.get("photos", [{}])[0].get("photo_reference")
                if photo_reference:
                    photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference={photo_reference}&key={API_KEY}"
                    self.root.get_screen('main').ids.food_card.ids.food_image.source = photo_url
                self.root.get_screen('main').ids.food_card.ids.food_name.text = place.get("name", "Unknown")
            else:
                self.show_consensus(session_id)

    def on_card_swipe(self, card, *args):
        """Handle card swipe to show the next place."""
        session_id = self.root.get_screen('session').ids.session_info.text.split(": ")[1]
        session = session_data.get(session_id)
        if session:
            session["current_index"] += 1
            if session["current_index"] >= len(session["places"]):
                session["current_index"] = 0  # Loop back to the first place
            self.update_food_card(session_id)

    def on_card_release(self, card, *args):
        """Handle card release (optional)."""
        pass

    def track_user_agreement(self, session_id, user_id, place_id):
        """Track the places each user swipes right on."""
        session = session_data.get(session_id)
        if session:
            if place_id not in session["agreed_places"]:
                session["agreed_places"][place_id] = set()
            session["agreed_places"][place_id].add(user_id)

    def show_consensus(self, session_id):
        """Display the places that all users in the session agreed on."""
        session = session_data.get(session_id)
        if session:
            agreed_places = [
                place_id for place_id, users in session["agreed_places"].items()
                if len(users) == len(session["members"])
            ]
            consensus_screen = self.root.get_screen('consensus')
            consensus_list = consensus_screen.ids.consensus_list
            consensus_list.clear_widgets()
            for place_id in agreed_places:
                place = next((p for p in session["places"] if p["place_id"] == place_id), None)
                if place:
                    consensus_list.add_widget(
                        MDLabel(
                            text=place.get("name", "Unknown"),
                            halign="center",
                            font_style="H5"
                        )
                    )
            self.root.current = 'consensus'

FoodMatchApp().run()
