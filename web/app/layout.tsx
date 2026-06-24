import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Detour — fly A → C → B for less",
  description:
    "Detour checks whether flying via another city, with a multi-night stay, costs less than the direct ticket.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
