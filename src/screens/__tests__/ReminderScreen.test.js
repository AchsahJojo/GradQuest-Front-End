import React from "react";
import { render } from "@testing-library/react-native";
import ReminderScreen, { parseReminderDate } from "../ReminderScreen";

let mockMe = { authenticated: true };

jest.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ me: mockMe }),
}));

describe("ReminderScreen", () => {
  beforeEach(() => {
    mockMe = { authenticated: true };
    global.fetch.mockClear();
  });

  it("loads the session user's reminders without a userId", async () => {
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: 1, title: "Application deadline: UC San Diego", reminderDate: "2027-01-15", isCompleted: false },
          ]),
      })
    );
    const { getByText, findByText } = render(<ReminderScreen />);

    expect(getByText("Reminders")).toBeTruthy();
    expect(await findByText("Application deadline: UC San Diego")).toBeTruthy();
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/api\/reminders$/);
    expect(options).toMatchObject({ credentials: "include" });
  });

  it("shows a date-only deadline on that calendar day", async () => {
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 16,
              title: "Application deadline: University of Nevada, Las Vegas",
              reminderDate: "2026-12-01",
              isCompleted: false,
            },
          ]),
      })
    );
    const { findByText } = render(<ReminderScreen />);
    const expected = new Date(2026, 11, 1).toLocaleDateString();

    expect(parseReminderDate("2026-12-01").getDate()).toBe(1);
    expect(parseReminderDate("2026-12-01").getMonth()).toBe(11);
    expect(
      await findByText(`Due: ${expected}`)
    ).toBeTruthy();
  });

  it("uses the local calendar day for the two-week warning", async () => {
    const iso = (daysAhead) => {
      const day = new Date();
      day.setHours(12, 0, 0, 0);
      day.setDate(day.getDate() + daysAhead);
      const month = String(day.getMonth() + 1).padStart(2, "0");
      const date = String(day.getDate()).padStart(2, "0");
      return `${day.getFullYear()}-${month}-${date}`;
    };

    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 2,
              title: "Application deadline: soon",
              reminderDate: iso(7),
              isCompleted: false,
            },
          ]),
      })
    );
    const soon = render(<ReminderScreen />);
    expect(await soon.findByText("Due within 2 weeks")).toBeTruthy();

    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 3,
              title: "Application deadline: later",
              reminderDate: iso(20),
              isCompleted: false,
            },
          ]),
      })
    );
    const later = render(<ReminderScreen />);
    expect(await later.findByText("Application deadline: later")).toBeTruthy();
    expect(later.queryByText("Due within 2 weeks")).toBeNull();
  });

  it("shows the empty state and skips the API when signed out", async () => {
    mockMe = { authenticated: false };
    const { findByText } = render(<ReminderScreen />);

    expect(await findByText("No reminders yet.")).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
