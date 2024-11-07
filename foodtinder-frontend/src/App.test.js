import { render, screen } from '@testing-library/react';
import App from './App';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

// Create a new instance of MockAdapter
const mock = new MockAdapter(axios);

// Mock the POST request to create a session
mock.onPost('http://localhost:8080/createSessionWithParameters').reply(200, {
  session_id: 'session1',
});

// Mock the POST request to track user agreement
mock.onPost('http://localhost:8080/trackUserAgreement').reply(200, {
  message: 'User agreement tracked',
});

test('renders Food Tinder heading', () => {
  render(<App />);
  const headingElement = screen.getByText(/Food Tinder/i);
  expect(headingElement).toBeInTheDocument();
});

test('renders No more places subheading', () => {
  render(<App />);
  const subheadingElement = screen.getByText(/No more places/i);
  expect(subheadingElement).toBeInTheDocument();
});

test('renders Show Consensus button', () => {
  render(<App />);
  const buttonElement = screen.getByText(/Show Consensus/i);
  expect(buttonElement).toBeInTheDocument();
});