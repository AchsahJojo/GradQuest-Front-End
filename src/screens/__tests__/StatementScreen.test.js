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

  test("re-reads the program page when Try again is pressed after an error", async () => {
    let programCalls = 0;
    global.fetch.mockImplementation((url) => {
      if (String(url).endsWith("/api/sop/programs")) {
        programCalls += 1;
        return jsonResponse(
          programCalls === 1
            ? {
                sopRequired: true,
                pageStatus: "error",
                message: "The program page didn't respond after several tries. Try again in a few minutes.",
              }
            : { sopRequired: true, pageStatus: "ok", message: "Read the public program page." },
        );
      }
      return jsonResponse({}, false);
    });

    const { findByText, findByLabelText, queryByLabelText } = render(<StatementScreen />);
    expect(await findByText(/didn't respond after several tries/)).toBeTruthy();
    fireEvent.press(await findByLabelText("Try again"));

    expect(await findByText("Read the public program page.")).toBeTruthy();
    expect(programCalls).toBe(2);
    expect(queryByLabelText("Try again")).toBeNull();
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
    fireEvent.press(await findByText("Draft full statement"));

    expect(await findByText("Draft outline — edit before you use it")).toBeTruthy();
    expect(await findByText(/\[R1\]/)).toBeTruthy();
    expect(await findByText(/\[STUDENT: add detail\]/)).toBeTruthy();
    await waitFor(() => {
      const draftCall = global.fetch.mock.calls.find(([url]) => String(url).endsWith("/api/sop/draft"));
      expect(JSON.parse(draftCall[1].body).mode).toBe("opening");
      expect(draftCall[1].body).not.toContain("http");
    });
  });

  test("shows Verified as of when verifiedAsOf is set", async () => {
    global.fetch.mockImplementation((url) => {
      if (String(url).endsWith("/api/sop/programs")) {
        return jsonResponse({
          sopRequired: true,
          pageStatus: "ok",
          message: "Read the public program page.",
          verifiedAsOf: "2026-03-01T00:00:00Z",
        });
      }
      return jsonResponse({}, false);
    });

    const { findByText } = render(<StatementScreen />);
    expect(await findByText("Verified as of 2026-03-01T00:00:00Z")).toBeTruthy();
  });

  test("Find matches stores pasted resume text and shows a weak overlap report", async () => {
    global.fetch.mockImplementation((url) => {
      const href = String(url);
      if (href.endsWith("/api/sop/programs")) {
        return jsonResponse({
          sopRequired: true,
          pageStatus: "ok",
          verifiedAsOf: "2026-03-01T00:00:00Z",
        });
      }
      if (href.endsWith("/api/sop/resume")) return jsonResponse({ stored: true, chunks: 1 });
      if (href.endsWith("/api/sop/overlap")) {
        return jsonResponse({
          weak: true,
          pairs: [],
          unmatchedKinds: ["faculty", "course"],
          verifiedAsOf: "2026-03-01T00:00:00Z",
        });
      }
      return jsonResponse({}, false);
    });

    const { findByText, getByLabelText } = render(<StatementScreen />);
    expect(await findByText("Verified as of 2026-03-01T00:00:00Z")).toBeTruthy();
    fireEvent.changeText(getByLabelText("Resume text"), "I studied distributed systems in a lab.");
    fireEvent.press(await findByText("Find matches"));

    expect(
      await findByText(
        "We found little connection between your résumé and this program's faculty or courses. The draft will leave those parts for you to write.",
      ),
    ).toBeTruthy();
    await waitFor(() => {
      const resumeCall = global.fetch.mock.calls.find(([url]) => String(url).endsWith("/api/sop/resume"));
      expect(JSON.parse(resumeCall[1].body)).toEqual({
        schoolId: 6,
        text: "I studied distributed systems in a lab.",
      });
      const overlapCall = global.fetch.mock.calls.find(([url]) => String(url).endsWith("/api/sop/overlap"));
      expect(JSON.parse(overlapCall[1].body)).toEqual({ schoolId: 6 });
    });
  });

  test("lists each pair with its source link and omits a removed pair from the draft", async () => {
    global.fetch.mockImplementation((url) => {
      const href = String(url);
      if (href.endsWith("/api/sop/programs")) {
        return jsonResponse({ sopRequired: true, pageStatus: "ok", message: "Read the public program page." });
      }
      if (href.endsWith("/api/sop/resume")) return jsonResponse({ stored: true, chunks: 1 });
      if (href.endsWith("/api/sop/overlap")) {
        return jsonResponse({
          weak: false,
          unmatchedKinds: [],
          verifiedAsOf: "2026-03-01T00:00:00Z",
          pairs: [
            {
              pairId: "0:faculty-ada",
              resumeText: "I studied distributed systems in a lab.",
              factKind: "faculty",
              factName: "Ada Lovelace",
              factDetail: "Studies formal methods.",
              sourceUrl: "https://catalog.calpoly.edu/faculty/ada",
              reason: "Both discuss formal methods.",
            },
            {
              pairId: "1:course-compilers",
              resumeText: "I built a compiler for a class.",
              factKind: "course",
              factName: "Compilers",
              factDetail: "A graduate compilers course.",
              sourceUrl: "https://catalog.calpoly.edu/courses/compilers",
              reason: "Both discuss compilers.",
            },
          ],
        });
      }
      if (href.endsWith("/api/sop/draft")) {
        return jsonResponse({ paragraph: "I studied compilers [R1].", label: "Draft outline — edit before you use it" });
      }
      return jsonResponse({}, false);
    });

    const { findByText, getByLabelText, queryByText } = render(<StatementScreen />);
    fireEvent.press(await findByText("Find matches"));
    expect(await findByText("Ada Lovelace")).toBeTruthy();
    expect(await findByText("I studied distributed systems in a lab.")).toBeTruthy();
    expect(await findByText("https://catalog.calpoly.edu/faculty/ada")).toBeTruthy();
    expect(await findByText("Compilers")).toBeTruthy();
    expect(await findByText("I built a compiler for a class.")).toBeTruthy();
    expect(await findByText("https://catalog.calpoly.edu/courses/compilers")).toBeTruthy();
    expect(
      queryByText(
        "We found little connection between your résumé and this program's faculty or courses. The draft will leave those parts for you to write.",
      ),
    ).toBeNull();

    fireEvent.press(getByLabelText("Remove Ada Lovelace"));
    fireEvent.press(await findByText("Draft full statement"));

    await waitFor(() => {
      const draftCall = global.fetch.mock.calls.find(([url]) => String(url).endsWith("/api/sop/draft"));
      expect(JSON.parse(draftCall[1].body).pairIds).toEqual(["1:course-compilers"]);
    });
  });

  test("does not send pairIds before a report has loaded", async () => {
    global.fetch.mockImplementation((url) => {
      const href = String(url);
      if (href.endsWith("/api/sop/programs")) {
        return jsonResponse({ sopRequired: true, pageStatus: "ok", message: "Read the public program page." });
      }
      if (href.endsWith("/api/sop/draft")) {
        return jsonResponse({ paragraph: "I studied compilers [R1].", label: "Draft outline — edit before you use it" });
      }
      return jsonResponse({}, false);
    });

    const { findByText } = render(<StatementScreen />);
    fireEvent.press(await findByText("Draft full statement"));

    await waitFor(() => {
      const draftCall = global.fetch.mock.calls.find(([url]) => String(url).endsWith("/api/sop/draft"));
      expect(draftCall).toBeTruthy();
      expect(JSON.parse(draftCall[1].body).pairIds).toBeUndefined();
    });
  });

  test("does not show a verified line when verifiedAsOf is missing or empty", async () => {
    global.fetch.mockImplementation((url) => {
      if (String(url).endsWith("/api/sop/programs")) {
        return jsonResponse({
          sopRequired: true,
          pageStatus: "ok",
          message: "Read the public program page.",
          verifiedAsOf: "",
        });
      }
      return jsonResponse({}, false);
    });

    const { findByText, queryByText } = render(<StatementScreen />);
    expect(await findByText("Read the public program page.")).toBeTruthy();
    expect(queryByText(/Verified as of/)).toBeNull();
  });
});
