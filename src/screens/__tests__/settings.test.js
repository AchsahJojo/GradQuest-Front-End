import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import SettingsScreen from "../SettingsScreen";

const mockNavigate = jest.fn();
const mockRefresh = jest.fn(() => Promise.resolve());
const mockSetMe = jest.fn();
let mockMe = null;
let mockRouteParams = {};

jest.mock("@react-navigation/native", () => {
  const React = require("react");
  return {
    useNavigation: () => ({ navigate: mockNavigate, reset: jest.fn() }),
    useRoute: () => ({ params: mockRouteParams }),
    useFocusEffect: (effect) => React.useEffect(effect, [effect]),
  };
});

jest.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    me: mockMe,
    refresh: mockRefresh,
    logout: jest.fn(),
    setMe: mockSetMe,
  }),
}));

describe("SettingsScreen", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockRefresh.mockClear();
    mockSetMe.mockClear();
    mockRouteParams = {};
    global.fetch.mockReset();
  });

  it("shows a loading label instead of 'Unknown User' before /api/me loads", () => {
    mockMe = null;
    const { getByText, queryByText } = render(<SettingsScreen />);
    expect(getByText("Loading…")).toBeTruthy();
    expect(queryByText("Unknown User")).toBeNull();
  });

  it("shows the signed-in user's name and refreshes on focus", async () => {
    mockMe = {
      authenticated: true,
      name: "Test User",
      login: "testuser",
      email: "tester@dev.local",
    };
    const { getByText } = render(<SettingsScreen />);
    expect(getByText("Test User")).toBeTruthy();
    expect(getByText("tester@dev.local")).toBeTruthy();
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("prompts for a real email when the OAuth address is noreply", () => {
    mockMe = {
      authenticated: true,
      name: "GitHub User",
      email: "login@github.noreply",
    };
    const { getByText, getByLabelText } = render(<SettingsScreen />);
    expect(
      getByText(/Add a real email so GradQuest can send deadline reminders/)
    ).toBeTruthy();
    expect(getByLabelText("Email address")).toBeTruthy();
    expect(getByLabelText("Save email")).toBeTruthy();
  });

  it("PATCHes /api/me when saving a deliverable email", async () => {
    mockMe = {
      authenticated: true,
      name: "GitHub User",
      email: "login@github.noreply",
    };
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            authenticated: true,
            email: "you@example.com",
            emailDeliverable: true,
          }),
      })
    );
    const { getByLabelText, findByText } = render(<SettingsScreen />);
    fireEvent.changeText(getByLabelText("Email address"), "you@example.com");
    fireEvent.press(getByLabelText("Save email"));

    await findByText("Email saved. Deadline reminders can go to this address.");
    const patch = global.fetch.mock.calls.find(([, o]) => o?.method === "PATCH");
    expect(patch[0]).toMatch(/\/api\/me$/);
    expect(JSON.parse(patch[1].body)).toEqual({ email: "you@example.com" });
  });

  it("navigates to ProfileIntake from Adjust Preferences", async () => {
    mockMe = { authenticated: true, name: "Test User", email: "a@b.co" };
    const { getByText } = render(<SettingsScreen />);
    fireEvent.press(getByText("Adjust Preferences"));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("ProfileIntake"));
  });
});
