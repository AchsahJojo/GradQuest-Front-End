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

    const { findByText, findByDisplayValue, getByLabelText } = render(<StatementScreen />);
    expect(await findByText("Paste the prompt if you have it. GradQuest will not guess it.")).toBeTruthy();
    fireEvent.changeText(getByLabelText("Resume text"), "Built a compiler");
    fireEvent.press(await findByText("Draft outline"));

    expect(await findByText("Draft outline — edit before you use it")).toBeTruthy();
    const draftBox = await findByDisplayValue(/\[R1\]/);
    expect(draftBox).toBeTruthy();
    fireEvent.changeText(draftBox, "I built a compiler [R1]. I wrote this sentence myself.");
    expect(await findByDisplayValue("I built a compiler [R1]. I wrote this sentence myself.")).toBeTruthy();
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

  test("shows a temporary matching error instead of the little-overlap note when overlap fails", async () => {
    global.fetch.mockImplementation((url) => {
      const href = String(url);
      if (href.endsWith("/api/sop/programs")) {
        return jsonResponse({ sopRequired: true, pageStatus: "ok", verifiedAsOf: "2026-03-01T00:00:00Z" });
      }
      if (href.endsWith("/api/sop/resume")) return jsonResponse({ stored: true, chunks: 1 });
      if (href.endsWith("/api/sop/overlap")) {
        return jsonResponse({ message: "Matching is temporarily unavailable, try again later" }, false);
      }
      return jsonResponse({}, false);
    });

    const { findByText, getByLabelText, queryByText } = render(<StatementScreen />);
    expect(await findByText("Verified as of 2026-03-01T00:00:00Z")).toBeTruthy();
    fireEvent.changeText(getByLabelText("Resume text"), "I studied distributed systems in a lab.");
    fireEvent.press(await findByText("Find matches"));

    expect(await findByText("Matching is temporarily unavailable, try again later")).toBeTruthy();
    expect(
      queryByText(
        "We found little connection between your résumé and this program's faculty or courses. The draft will leave those parts for you to write.",
      ),
    ).toBeNull();
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
          visibleCount: 8,
          pairs: [
            {
              pairId: "faculty-ada",
              resumeText: "I studied distributed systems in a lab.",
              resumeQuotes: ["I studied distributed systems in a lab."],
              factKind: "faculty",
              factName: "Ada Lovelace",
              factDetail: "Studies formal methods.",
              subtitle: "Studies formal methods.",
              researchVerified: true,
              sourceUrl: "https://catalog.calpoly.edu/faculty/ada",
              reason: "Both discuss formal methods.",
            },
            {
              pairId: "course-compilers",
              resumeText: "I built a compiler for a class.",
              resumeQuotes: ["I built a compiler for a class."],
              factKind: "course",
              factName: "Compilers",
              factDetail: "A graduate compilers course.",
              subtitle: "",
              researchVerified: true,
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
    expect(await findByText("Studies formal methods.")).toBeTruthy();
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
    fireEvent.press(await findByText("Draft outline"));

    await waitFor(() => {
      const draftCall = global.fetch.mock.calls.find(([url]) => String(url).endsWith("/api/sop/draft"));
      expect(JSON.parse(draftCall[1].body).pairIds).toEqual(["course-compilers"]);
    });
  });

  test("shows Research interests not verified for thin faculty and Show all beyond eight cards", async () => {
    const pairs = [
      {
        pairId: "thin-fac",
        resumeText: "I studied computer science.",
        resumeQuotes: ["I studied computer science."],
        factKind: "faculty",
        factName: "Jedidiah Crandall",
        factDetail: "",
        subtitle: "Research interests not verified.",
        researchVerified: false,
        sourceUrl: "https://example.edu/thin",
        reason: "Name listed.",
        score: 0.99,
      },
      ...Array.from({ length: 9 }, (_, index) => ({
        pairId: `course-${index}`,
        resumeText: `Resume quote ${index}`,
        resumeQuotes: [`Resume quote ${index}`],
        factKind: "course",
        factName: `Course ${index}`,
        factDetail: `Detail ${index}`,
        subtitle: "",
        researchVerified: true,
        sourceUrl: `https://example.edu/c${index}`,
        reason: "topic",
        score: 0.9 - index * 0.01,
      })),
    ];
    global.fetch.mockImplementation((url) => {
      const href = String(url);
      if (href.endsWith("/api/sop/programs")) {
        return jsonResponse({ sopRequired: true, pageStatus: "ok", message: "Read the public program page." });
      }
      if (href.endsWith("/api/sop/resume")) return jsonResponse({ stored: true, chunks: 1 });
      if (href.endsWith("/api/sop/overlap")) {
        return jsonResponse({ weak: false, unmatchedKinds: [], verifiedAsOf: "2026-03-01T00:00:00Z", visibleCount: 8, pairs });
      }
      return jsonResponse({}, false);
    });

    const { findByText, queryByText, getByLabelText } = render(<StatementScreen />);
    fireEvent.press(await findByText("Find matches"));
    expect(await findByText("Jedidiah Crandall")).toBeTruthy();
    expect(await findByText("Research interests not verified.")).toBeTruthy();
    expect(await findByText("Course 0")).toBeTruthy();
    expect(queryByText("Course 7")).toBeNull();
    expect(queryByText("Course 8")).toBeNull();
    fireEvent.press(getByLabelText("Show all"));
    expect(await findByText("Course 7")).toBeTruthy();
    expect(await findByText("Course 8")).toBeTruthy();
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
    fireEvent.press(await findByText("Draft outline"));

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

  test("Delete my résumé stays available when the program check fails", async () => {
    global.fetch.mockImplementation((url) => {
      if (String(url).endsWith("/api/sop/programs")) return jsonResponse({}, false);
      return jsonResponse({}, false);
    });

    const { findByLabelText, findByText } = render(<StatementScreen />);
    expect(await findByText("We couldn't check this program's statement requirement.")).toBeTruthy();
    expect(await findByLabelText("Delete my résumé")).toBeTruthy();
  });

  test("Delete my résumé asks for confirmation before DELETE /api/sop/resume", async () => {
    global.fetch.mockImplementation((url, options) => {
      const href = String(url);
      if (href.endsWith("/api/sop/programs")) {
        return jsonResponse({ sopRequired: true, pageStatus: "ok", message: "Read the public program page." });
      }
      if (href.endsWith("/api/sop/resume") && options?.method === "DELETE") {
        return jsonResponse({ deleted: true });
      }
      return jsonResponse({}, false);
    });

    const { findByText, findByLabelText, queryByLabelText } = render(<StatementScreen />);
    fireEvent.press(await findByLabelText("Delete my résumé"));
    expect(await findByText("Delete the stored résumé? This removes it from GradQuest.")).toBeTruthy();
    expect(global.fetch.mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false);

    fireEvent.press(await findByLabelText("Cancel résumé deletion"));
    expect(queryByLabelText("Confirm delete résumé")).toBeNull();
    expect(global.fetch.mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false);

    fireEvent.press(await findByLabelText("Delete my résumé"));
    fireEvent.press(await findByLabelText("Confirm delete résumé"));
    await waitFor(() => {
      const deleteCall = global.fetch.mock.calls.find(([, options]) => options?.method === "DELETE");
      expect(deleteCall[0]).toContain("/api/sop/resume");
    });
    expect(await findByText("Stored résumé deleted.")).toBeTruthy();
  });

  test("loads a saved draft on mount and shows the saved-draft affordance", async () => {
    global.fetch.mockImplementation((url) => {
      const href = String(url);
      if (href.endsWith("/api/sop/programs")) {
        return jsonResponse({ sopRequired: true, pageStatus: "ok", message: "Read the public program page." });
      }
      if (href.includes("/api/statement-drafts")) {
        return jsonResponse({
          body: "I studied compilers and want this program.",
          updatedAt: "2026-11-19T12:00:00Z",
        });
      }
      return jsonResponse({}, false);
    });

    const { findByText, findByDisplayValue, findByLabelText } = render(<StatementScreen />);
    expect(await findByText("Saved draft")).toBeTruthy();
    expect(await findByDisplayValue("I studied compilers and want this program.")).toBeTruthy();
    expect(await findByLabelText("Save draft")).toBeTruthy();
    expect(await findByLabelText("Delete draft")).toBeTruthy();
    await waitFor(() => {
      const getDraft = global.fetch.mock.calls.find(
        ([url, options]) => String(url).includes("/api/statement-drafts") && (!options || !options.method || options.method === "GET"),
      );
      expect(getDraft[0]).toContain("schoolId=6");
    });
  });

  test("Save draft PUTs the current text and shows a brief confirmation", async () => {
    global.fetch.mockImplementation((url, options) => {
      const href = String(url);
      if (href.endsWith("/api/sop/programs")) {
        return jsonResponse({ sopRequired: true, pageStatus: "ok", message: "Read the public program page." });
      }
      if (href.includes("/api/statement-drafts") && options?.method === "PUT") {
        return jsonResponse({ body: "Edited draft text.", updatedAt: "2026-11-19T12:05:00Z" });
      }
      if (href.includes("/api/statement-drafts")) {
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
      }
      if (href.endsWith("/api/sop/draft")) {
        return jsonResponse({ paragraph: "Generated outline.", label: "Draft outline — edit before you use it" });
      }
      return jsonResponse({}, false);
    });

    const { findByText, findByLabelText } = render(<StatementScreen />);
    fireEvent.press(await findByText("Draft outline"));
    const draftBox = await findByLabelText("Draft outline — edit before you use it");
    fireEvent.changeText(draftBox, "Edited draft text.");
    fireEvent.press(await findByLabelText("Save draft"));

    expect(await findByText("Draft saved.")).toBeTruthy();
    await waitFor(() => {
      const putCall = global.fetch.mock.calls.find(
        ([url, options]) => String(url).includes("/api/statement-drafts") && options?.method === "PUT",
      );
      expect(JSON.parse(putCall[1].body)).toEqual({ schoolId: 6, body: "Edited draft text." });
    });
    expect(await findByLabelText("Delete draft")).toBeTruthy();
  });

  test("Delete draft asks for confirmation then DELETEs and clears the local draft", async () => {
    global.fetch.mockImplementation((url, options) => {
      const href = String(url);
      if (href.endsWith("/api/sop/programs")) {
        return jsonResponse({ sopRequired: true, pageStatus: "ok", message: "Read the public program page." });
      }
      if (href.includes("/api/statement-drafts") && options?.method === "DELETE") {
        return jsonResponse({});
      }
      if (href.includes("/api/statement-drafts")) {
        return jsonResponse({
          body: "Persisted draft from last visit.",
          updatedAt: "2026-11-19T12:00:00Z",
        });
      }
      return jsonResponse({}, false);
    });

    const { findByText, findByLabelText, findByDisplayValue, queryByDisplayValue, queryByLabelText } =
      render(<StatementScreen />);
    expect(await findByDisplayValue("Persisted draft from last visit.")).toBeTruthy();
    fireEvent.press(await findByLabelText("Delete draft"));
    expect(await findByText("Delete the saved draft? This removes it from GradQuest.")).toBeTruthy();
    expect(
      global.fetch.mock.calls.some(
        ([url, options]) => String(url).includes("/api/statement-drafts") && options?.method === "DELETE",
      ),
    ).toBe(false);

    fireEvent.press(await findByLabelText("Cancel draft deletion"));
    expect(queryByLabelText("Confirm delete draft")).toBeNull();

    fireEvent.press(await findByLabelText("Delete draft"));
    fireEvent.press(await findByLabelText("Confirm delete draft"));
    await waitFor(() => {
      const deleteCall = global.fetch.mock.calls.find(
        ([url, options]) => String(url).includes("/api/statement-drafts") && options?.method === "DELETE",
      );
      expect(deleteCall[0]).toContain("schoolId=6");
    });
    expect(await findByText("Saved draft deleted.")).toBeTruthy();
    expect(queryByDisplayValue("Persisted draft from last visit.")).toBeNull();
    expect(queryByLabelText("Delete draft")).toBeNull();
  });

  test("Generate does not PUT a statement draft until Save", async () => {
    global.fetch.mockImplementation((url, options) => {
      const href = String(url);
      if (href.endsWith("/api/sop/programs")) {
        return jsonResponse({ sopRequired: true, pageStatus: "ok", message: "Read the public program page." });
      }
      if (href.includes("/api/statement-drafts") && options?.method === "PUT") {
        return jsonResponse({ body: "I studied compilers [R1].", updatedAt: "2026-11-19T12:05:00Z" });
      }
      if (href.includes("/api/statement-drafts")) {
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
      }
      if (href.endsWith("/api/sop/draft")) {
        return jsonResponse({ paragraph: "I studied compilers [R1].", label: "Draft outline — edit before you use it" });
      }
      return jsonResponse({}, false);
    });

    const { findByText, findByLabelText, queryByLabelText } = render(<StatementScreen />);
    fireEvent.press(await findByText("Draft outline"));
    expect(await findByLabelText("Save draft")).toBeTruthy();
    expect(queryByLabelText("Delete draft")).toBeNull();

    await waitFor(() => {
      expect(global.fetch.mock.calls.some(([url]) => String(url).endsWith("/api/sop/draft"))).toBe(true);
    });
    expect(
      global.fetch.mock.calls.some(
        ([url, options]) => String(url).includes("/api/statement-drafts") && options?.method === "PUT",
      ),
    ).toBe(false);

    fireEvent.press(await findByLabelText("Save draft"));
    await waitFor(() => {
      expect(
        global.fetch.mock.calls.some(
          ([url, options]) => String(url).includes("/api/statement-drafts") && options?.method === "PUT",
        ),
      ).toBe(true);
    });
  });
});
