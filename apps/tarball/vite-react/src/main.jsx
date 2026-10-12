import { decode } from "@qhago/scanner";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

function App() {
  const [text, setText] = useState("…");
  useEffect(() => {
    fetch("/fixture.png")
      .then((r) => r.blob())
      .then((b) => decode(b))
      .then((r) => {
        const t = r.map((x) => x.text).join(",");
        setText(t);
        window.__result = t;
      })
      .catch((e) => {
        window.__result = `ERR:${e?.message ?? e}`;
      });
  }, []);
  return <p>{text}</p>;
}

createRoot(document.getElementById("root")).render(<App />);
