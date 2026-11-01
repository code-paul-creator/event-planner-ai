import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Event Planner AI | Weddings, birthdays & community events",
  description:
    "Get a personalised budget, timeline, vendor checklist and ideas for your wedding, birthday or community event, powered by Gemini.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121317" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <header className="site-header">
          <p className="brand">Event Planner AI</p>
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <p>
            Plans are AI-generated suggestions. Verify prices, availability and local requirements
            with your vendors.
          </p>
        </footer>
      </body>
    </html>
  );
}
