/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { sanitizeJobDescription, stripHtml } from "./sanitize";

describe("sanitize", () => {
  describe("sanitizeJobDescription", () => {
    it("should allow safe HTML tags", () => {
      const input = "<p>Hello <b>world</b>!</p><ul><li>Item 1</li></ul>";
      const output = sanitizeJobDescription(input);
      expect(output).toBe(input);
    });

    it("should strip scripts", () => {
      const input = "<p>Hello</p><script>alert('xss')</script>";
      const output = sanitizeJobDescription(input);
      expect(output).toBe("<p>Hello</p>");
    });

    it("should strip event handlers", () => {
      const input = '<img src="x" onerror="alert(1)">';
      const output = sanitizeJobDescription(input);
      // Assert the security property, not the exact serialization: DOMPurify
      // strips the onerror handler (the thing under test) but may wrap the
      // bare <img> in a <p>. Pinning the exact string made this brittle.
      expect(output).not.toContain("onerror");
      expect(output).not.toContain("alert");
      expect(output).toContain("<img");
      expect(output).toContain('src="x"');
    });

    it("should force target=\"_blank\" on links", () => {
      const input = '<a href="https://example.com">Click here</a>';
      const output = sanitizeJobDescription(input);
      expect(output).toContain('href="https://example.com"');
      expect(output).toContain('target="_blank"');
    });

    it("should strip forbidden attributes", () => {
      const input = '<div onclick="evil()">Safe</div>';
      const output = sanitizeJobDescription(input);
      expect(output).toBe("<div>Safe</div>");
    });

    it("should handle nested and broken HTML", () => {
      const input = "<div><p>Unclosed paragraph";
      const output = sanitizeJobDescription(input);
      expect(output).toBe("<div><p>Unclosed paragraph</p></div>");
    });
  });

  describe("stripHtml", () => {
    it("should remove all HTML tags", () => {
      const input = "<div><h1>Title</h1><p>Paragraph with <b>bold</b>.</p></div>";
      const output = stripHtml(input);
      expect(output).toBe("TitleParagraph with bold.");
    });

    it("should return plain text as is", () => {
      const input = "Plain text";
      const output = stripHtml(input);
      expect(output).toBe(input);
    });
  });
});
