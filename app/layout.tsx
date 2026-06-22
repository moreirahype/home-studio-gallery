import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { MetaPixel } from "@/components/meta-pixel";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "Home Studio",
  title: {
    default: "Home Studio | Ensaios com IA",
    template: "%s | Home Studio",
  },
  description:
    "Crie ensaios fotográficos com IA, escolha suas fotos e transforme-as em vídeos.",
  icons: {
    icon: "/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} ${playfair.variable}`}>
        {children}
        <MetaPixel pixelId={process.env.META_PIXEL_ID} />
      </body>
    </html>
  );
}
