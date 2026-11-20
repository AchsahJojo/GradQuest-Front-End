import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import DashboardScreen from "../DashboardScreen";
import { SavedAppsProvider } from "../../context/SavedAppsContext";

const mockNavigate = jest.fn();
let mockRouteParams = {};
let mockMe = { authenticated: true };

jest.mock("@react-navigation/native", () => {
  const React = require("react");
  return {
    useNavigation: () => ({ navigate: mockNavigate }),
    useRoute: () => ({ params: mockRouteParams }),
    useFocusEffect: (effect) => React.useEffect(effect, [effect]),
  };
});

jest.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ me: mockMe }),
}));

const okJson = (body) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

const renderDashboard = () =>
  render(
    <SavedAppsProvider>
      <DashboardScreen />
    </SavedAppsProvider>
  );

const fetchedUrls = () => global.fetch.mock.calls.map(([url]) => url);

describe("DashboardScreen", () => {
  beforeEach(() => {
    mockRouteParams = {};
    mockMe = { authenticated: true };
    global.fetch.mockClear();
  });

  test("renders the header and empty state", () => {
    mockMe = { authenticated: false };
    const { getByText } = renderDashboard();
    expect(getByText("Dashboard")).toBeTruthy();
    expect(getByText("Your dashboard")).toBeTruthy();
  });

  test("shows schools passed from ProfileIntake without refetching", () => {
    mockRouteParams = {
      topSchools: [
        { id: 1, name: "Stanford University", programName: "Computer Science MS", websiteUrl: "https://stanford.edu" },
        { id: 2, name: "Local College" },
      ],
    };
    const { getByText, getAllByText } = renderDashboard();

    expect(getByText("Stanford University")).toBeTruthy();
    fireEvent.press(getAllByText("Statement")[0]);
    expect(mockNavigate).toHaveBeenCalledWith("Statement", {
      schoolId: 1,
      schoolName: "Stanford University",
      programName: "Computer Science MS",
    });
    expect(getByText("Computer Science MS")).toBeTruthy();
    expect(getByText("Program info")).toBeTruthy();
    expect(getByText("No website")).toBeTruthy();
    expect(fetchedUrls()).toEqual([]);
  });

  test("fetches top schools for the signed-in session without a userId", async () => {
    global.fetch.mockImplementationOnce(() =>
      okJson({ matches: [{ id: 7, name: "San Jose State University" }] })
    );
    const { findByText } = renderDashboard();

    expect(await findByText("San Jose State University")).toBeTruthy();
    expect(fetchedUrls()[0]).toMatch(/\/api\/schools\/top5$/);
    expect(global.fetch.mock.calls[0][1]).toMatchObject({ credentials: "include" });
  });

  test("shows rank, term line, and match banner from Track A payload", () => {
    mockRouteParams = {
      topSchools: {
        matches: [
          {
            id: 6,
            rank: 1,
            matchScore: 88,
            name: "CSU Fullerton",
            programName: "Computer Science, M.S.",
            term: "SPRING",
            startYear: 2027,
            deadline: "2026-12-01",
            closingSoon: false,
            matchReasons: ["Fits budget", "Matches location"],
            lastVerified: "2026-10-17",
          },
        ],
        message: "Showing 1 match — try enabling GRE, widening location, or another start term.",
        nextOpenTerm: { term: "FALL", startYear: 2027, schoolName: "SJSU" },
      },
    };
    const { getByText } = renderDashboard();
    expect(getByText("#1")).toBeTruthy();
    expect(getByText("CSU Fullerton")).toBeTruthy();
    expect(getByText(/Spring 2027/)).toBeTruthy();
    expect(getByText(/Fits budget/)).toBeTruthy();
    expect(getByText(/Showing 1 match/)).toBeTruthy();
    expect(getByText(/Next open term suggestion/)).toBeTruthy();
  });

  test("saving and removing a school creates and deletes its reminder", async () => {
    mockMe = { authenticated: true, email: "tester@dev.local" };
    mockRouteParams = { topSchools: [{ id: 3, name: "Georgia Tech" }] };
    global.fetch.mockImplementation(() => okJson({}));
    const { getByText, findByText, getByLabelText } = renderDashboard();

    fireEvent.press(getByText("Save"));
    expect(
      await findByText("Saved. We’ll email a deadline reminder about 2 weeks before.")
    ).toBeTruthy();
    fireEvent.press(await findByText("Remove"));
    fireEvent.press(getByLabelText("Confirm unsave Georgia Tech"));
    await findByText("Save");

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const [create, remove] = global.fetch.mock.calls;
    expect(create[0]).toMatch(/\/api\/reminders\?schoolId=3$/);
    expect(create[1]).toMatchObject({ method: "POST", credentials: "include" });
    expect(remove[0]).toMatch(/\/api\/reminders\/school\/3$/);
    expect(remove[1]).toMatchObject({ method: "DELETE" });
    expect(fetchedUrls().join(" ")).not.toMatch(/userId/);
  });

  test("canceling unsave keeps the school saved", async () => {
    mockMe = { authenticated: true, userId: 1, email: "tester@dev.local" };
    mockRouteParams = { topSchools: [{ id: 3, name: "Georgia Tech" }] };
    global.fetch.mockImplementation((url) =>
      String(url).endsWith("/api/reminders")
        ? okJson([{ id: 10, schoolId: 3, schoolName: "Georgia Tech" }])
        : okJson({})
    );
    const { findByText, getByLabelText, queryByText } = renderDashboard();

    expect(await findByText("Remove")).toBeTruthy();
    fireEvent.press(await findByText("Remove"));
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
    expect(await findByText("Remove")).toBeTruthy();
    const deletes = global.fetch.mock.calls.filter(([, o]) => o?.method === "DELETE");
    expect(deletes).toHaveLength(0);
  });

  test("saving with a noreply email prompts Settings for a real address", async () => {
    mockMe = { authenticated: true, email: "login@github.noreply" };
    mockRouteParams = { topSchools: [{ id: 3, name: "Georgia Tech" }] };
    global.fetch.mockImplementation(() => okJson({ id: 1, schoolId: 3 }));
    const { getByText, findByText } = renderDashboard();

    fireEvent.press(getByText("Save"));
    expect(
      await findByText(
        "Saved. Add a real email in Settings to get deadline reminder emails."
      )
    ).toBeTruthy();
    expect(getByText("Open Settings")).toBeTruthy();
  });

  test("schools already saved on the backend show Remove", async () => {
    mockMe = { authenticated: true, userId: 1 };
    mockRouteParams = { topSchools: [{ id: 3, name: "Georgia Tech" }, { id: 4, name: "Rice" }] };
    global.fetch.mockImplementation((url) =>
      url.endsWith("/api/reminders")
        ? okJson([{ id: 10, schoolId: 3, schoolName: "Georgia Tech" }])
        : okJson({})
    );
    const { findByText, getAllByText } = renderDashboard();

    expect(await findByText("Remove")).toBeTruthy();
    expect(getAllByText("Save")).toHaveLength(1);
  });

  test("a failed save rolls back and shows an error", async () => {
    mockRouteParams = { topSchools: [{ id: 3, name: "Georgia Tech" }] };
    global.fetch.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({}) })
    );
    const { getByText, findByText, queryByText } = renderDashboard();

    fireEvent.press(getByText("Save"));

    expect(await findByText("We couldn't save that school. Please try again.")).toBeTruthy();
    expect(getByText("Save")).toBeTruthy();
    expect(queryByText("Remove")).toBeNull();
  });
});
