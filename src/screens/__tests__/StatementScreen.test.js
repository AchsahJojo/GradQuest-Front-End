import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import StatementScreen from "../StatementScreen";

const mockGoBack = jest.fn();
let mockParams = {};

jest.mock("@react-navigation/native", () => {
  const React = require("react");
  return {
    useNavigation: () => ({ navigate: jest.fn(), goBack: mockGoBack }),
    useRoute: () => ({ params: mockParams }),
    useFocusEffect: (effect) => React.useEffect(effect, [effect]),
  };
});

const jsonResponse = (body, ok = true) =>
  Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  });

describe("StatementScreen", () => {
  beforeEach(() => {
    mockParams = { schoolId: 6, schoolName: "California State University, Fullerton", programName: "Computer Science, M.S." };
    global.fetch.mockReset();
  });

  test("shows no statement required for a program that does not ask for one", async () => {
    global.fetch.mockImplementation((url) => {
      if (String(url).endsWith("/api/sop/programs")) {
        return jsonResponse({
          sopRequired: false,
          allowlisted: true,
          pageStatus: "ok",
          message: "Read the public program page.",
        });
      }
      return jsonResponse({}, false);
    });

    const { findByText, queryByText } = render(<StatementScreen />);
    expect(await findByText("No statement required")).toBeTruthy();
    expect(queryByText("Pasted prompt (optional)")).toBeNull();
    expect(await findByText("Draft optional motivation")).toBeTruthy();
  });

  test("drafts one cited opening and labels it as an outline", async () => {
    mockParams = { schoolId: 3, schoolName: "Cal Poly San Luis Obispo", programName: "Computer Science, M.S." };
    global.fetch.mockImplementation((url) => {
      const href = String(url);
      if (href.endsWith("/api/sop/programs")) {
        return jsonResponse({
          sopRequired: true,
          allowlisted: true,
          pageStatus: "login_wall",
          message: "Paste the prompt if you have it. GradQuest will not guess it.",
        });
      }
      if (href.endsWith("/api/sop/resume")) return jsonResponse({ stored: true, chunks: 1 });
      if (href.endsWith("/api/sop/draft")) {
        return jsonResponse({
          paragraph: "I built a compiler [R1]. [STUDENT: add detail] for the hidden prompt.",
          label: "Draft outline — edit before you use it",
        });
      }
      return jsonResponse({}, false);
    });

    const { findByText, getByLabelText } = render(<StatementScreen />);
    expect(await findByText("Paste the prompt if you have it. GradQuest will not guess it.")).toBeTruthy();
    fireEvent.changeText(getByLabelText("Resume text"), "Built a compiler");
    fireEvent.press(await findByText("Draft opening paragraph"));

    expect(await findByText("Draft outline — edit before you use it")).toBeTruthy();
    expect(await findByText(/\[R1\]/)).toBeTruthy();
    expect(await findByText(/\[STUDENT: add detail\]/)).toBeTruthy();
    await waitFor(() => {
      const draftCall = global.fetch.mock.calls.find(([url]) => String(url).endsWith("/api/sop/draft"));
      expect(JSON.parse(draftCall[1].body).mode).toBe("opening");
      expect(draftCall[1].body).not.toContain("http");
    });
  });
});
