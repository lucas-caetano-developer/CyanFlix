import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PromoBanner, getDefaultCategoryTitles } from "./PromoBanner";
import type { Character, Work } from "../../lib/types";

describe("PromoBanner Component & Helpers", () => {
  it("resolves default category titles according to character role", () => {
    expect(getDefaultCategoryTitles("Vilão")).toEqual({
      title: "VILÕES",
      subtitle: "ICÔNICOS",
    });
    expect(getDefaultCategoryTitles("Antagonista")).toEqual({
      title: "VILÕES",
      subtitle: "ICÔNICOS",
    });
    expect(getDefaultCategoryTitles("Coadjuvante")).toEqual({
      title: "COADJUVANTES",
      subtitle: "MARCANTES",
    });
    expect(getDefaultCategoryTitles("Protagonista")).toEqual({
      title: "PROTAGONISTAS",
      subtitle: "LENDÁRIOS",
    });
  });

  it("renders character name, category title and CTA button", () => {
    const mockCharacter: Character = {
      id: "char-1",
      name: "Tomura Shigaraki",
      role: "Vilão",
      themeColor: "#475569",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockWork: Work = {
      id: "work-1",
      title: "My Hero Academia",
      contentKind: "anime",
    };

    render(<PromoBanner character={mockCharacter} work={mockWork} />);

    // Character full name and watermark last name
    expect(screen.getAllByText(/Tomura Shigaraki/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("SHIGARAKI")).toBeInTheDocument();

    // Category title
    expect(screen.getByText("VILÕES")).toBeInTheDocument();
    expect(screen.getByText("ICÔNICOS")).toBeInTheDocument();

    // CTA Button
    expect(screen.getByRole("button", { name: /ASSISTA JÁ/i })).toBeInTheDocument();
  });
});
