export default function manifest() {
  return {
    name: "Sensei",
    short_name: "Sensei",
    description: "Konnichiwa! Learn any course from zero, together, with Sensei, your personal AI tutor.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f4ee",
    theme_color: "#2f6f5e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
