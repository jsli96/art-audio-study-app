import "./globals.css";

export const metadata = {
  title: "Art Audio Study",
  description: "User study prototype: image -> description -> TTS / intonation / music+intonation"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          {children}
        </div>
      </body>
    </html>
  );
}
