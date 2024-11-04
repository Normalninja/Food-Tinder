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



session_data = {}

def add_user_to_session(session_id, user_id):
    if session_id in session_data:
        session_data[session_id]["members"].append(user_id)
    else:
        session_data[session_id] = {"session_id": session_id, "members": [user_id]}
    print(f"User {user_id} added to session {session_id}. Current members: {session_data[session_id]['members']}")

KV = '''
ScreenManager:
    MenuScreen:
    ParameterScreen:
    SessionScreen:
    MainScreen:

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
        MDLabel:
            text: "Set Your Preferences"
            halign: 'center'
            font_style: "H5"
        MDTextField:
            id: distance
            hint_text: "Enter Distance (in meters)"
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
            source: root.image
            size_hint_y: 0.8
        MDLabel:
            text: root.name
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
'''


from plyer import gps
import requests
import qrcode
from kivy.lang import Builder
from kivy.uix.screenmanager import Screen, ScreenManager
from kivymd.app import MDApp

API_KEY = "YOUR_GOOGLE_PLACES_API_KEY"
android.permissions = ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION
class FoodMatchApp(MDApp):
    def build(self):
        return Builder.load_string(KV)

    def on_start(self):
        # Start GPS and request updates
        gps.configure(on_location=self.on_location, on_status=self.on_status)
        gps.start(minTime=1000, minDistance=1)

        # Initialize location variables
        self.latitude = None
        self.longitude = None

    def on_location(self, **kwargs):
        self.latitude = kwargs.get("lat")
        self.longitude = kwargs.get("lon")
        print(f"Location obtained: {self.latitude}, {self.longitude}")

    def on_status(self, stype, status):
        print(f"GPS status update: {stype}, {status}")

    def get_nearby_places(self, distance, price, rating):
        # Check if location is available
        if self.latitude is None or self.longitude is None:
            print("Waiting for location data...")
            return None

        # Use phone's GPS coordinates
        location = f"{self.latitude},{self.longitude}"
        url = f"https://maps.googleapis.com/maps/api/place/nearbysearch/json?location={location}&radius={distance}&minprice={price}&rating={rating}&type=restaurant&key={API_KEY}"
        
        response = requests.get(url)
        if response.status_code == 200:
            return response.json().get("results")
        else:
            print("Failed to fetch places.")
            return None

    def create_session_with_parameters(self, distance, price, rating):
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

    def generate_session_id(self):
        import uuid
        return str(uuid.uuid4())

    def generate_qr_code(self, session_id):
        qr = qrcode.make(session_id)
        qr.save("session_qr.png")
        print("QR Code generated and saved as session_qr.png")

    def go_to_parameters(self):
        self.root.current = 'parameters'

    def go_to_food_selection(self):
        self.root.current = 'main'

    def show_session_qr_code(self):
        self.root.current = 'session'

FoodMatchApp().run()
