"use client";
import { useEffect, useState } from "react";

export default function Scan() {
  const [text, setText] = useState("…");
  useEffect(() => {
    (async () => {
      try {
        const { decode } = await import("@qhago/scanner");
        const blob = await (await fetch("/fixture.png")).blob();
        const t = (await decode(blob)).map((x) => x.text).join(",");
        setText(t);
        window.__result = t;
      } catch (e) {
        window.__result = `ERR:${e?.message ?? e}`;
      }
    })();
  }, []);
  return <p id="result">{text}</p>;
}
