import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import SavedApplicationsScreen from "../SavedApplicationsScreen";
import { SavedAppsProvider } from "../../context/SavedAppsContext";

let mockMe = { authenticated: true, userId: 1, email: "tester@dev.local" };

jest.mock("@react-navigation/native", () => {
  const React = require("react");
  return {
    useNavigation: () => ({ navigate: jest.fn() }),
    useFocusEffect: (effect) => React.useEffect(effect, [effect]),
  };
});

jest.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ me: mockMe }),
}));

const ok = (body) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

const REMINDERS = [
  {
    id: 1,
    schoolId: 5,
    schoolName: "UC San Diego",
    programName: "MS CS",
    websiteUrl: "https://ucsd.edu",
  },
];

const renderScreen = () =>
  render(
    <SavedAppsProvider>
      <SavedApplicationsScreen />
    </SavedAppsProvider>
  );

describe("SavedApplicationsScreen unsave confirm", () => {
  beforeEach(() => {
    mockMe = { authenticated: true, userId: 1, email: "tester@dev.local" };
    global.fetch.mockReset();
  });

  it("cancel leaves the school saved and does not DELETE", async () => {
    global.fetch.mockImplementation(() => ok(REMINDERS));
    const { findByText, getByLabelText, queryByText } = renderScreen();

    expect(await findByText("UC San Diego")).toBeTruthy();
    fireEvent.press(getByLabelText("Remove UC San Diego"));

    expect(
      await findByText(
        "You won’t get deadline reminder emails for this school anymore."
      )
    ).toBeTruthy();
    fireEvent.press(getByLabelText("Cancel unsave"));

    await waitFor(() =>
      expect(
        queryByText(
          "You won’t get deadline reminder emails for this school anymore."
        )
      ).toBeNull()
    );
    expect(await findByText("UC San Diego")).toBeTruthy();
    const deletes = global.fetch.mock.calls.filter(([, o]) => o?.method === "DELETE");
    expect(deletes).toHaveLength(0);
  });

  it("confirm deletes the reminder and removes the school", async () => {
    global.fetch.mockImplementation((url, options = {}) =>
      options.method === "DELETE" ? ok({}) : ok(REMINDERS)
    );
    const { findByText, getByLabelText, queryByText } = renderScreen();

    expect(await findByText("UC San Diego")).toBeTruthy();
    fireEvent.press(getByLabelText("Remove UC San Diego"));
    fireEvent.press(getByLabelText("Confirm unsave UC San Diego"));

    await waitFor(() => expect(queryByText("UC San Diego")).toBeNull());
    const del = global.fetch.mock.calls.find(([, o]) => o?.method === "DELETE");
    expect(del[0]).toMatch(/\/api\/reminders\/school\/5$/);
  });
});
