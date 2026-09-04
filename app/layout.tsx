import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "French with Alban",
  description: "Cours de français en ligne avec un professeur natif",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,600;9..144,700&family=DM+Serif+Display&family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
            <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}