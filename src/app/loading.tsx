const phrases = [
  "잠시만 기다려줘…!",
  "준비 중이야…♪",
  "거의 다 왔어…!",
  "데이터 불러오는 중…♪",
  "원찬님 예은님… 기다려줘…!",
  "좋은 정보 찾는 중…♪",
  "잠깐만…! 곧 갈게…!",
];

const Loading = () => (
  <div
    className="flex min-h-screen flex-col items-center justify-center gap-4"
    style={{ backgroundColor: "var(--color-canvas)" }}
  >
    <img
      src="/munjackgui.webp"
      alt="치이카와"
      className="size-20 animate-bounce rounded-full object-cover"
      style={{ backgroundColor: "var(--color-canvas-soft)" }}
    />
    <p className="text-sm" style={{ color: "var(--color-muted)" }}>
      {phrases[Math.floor(Math.random() * phrases.length)]}
    </p>
  </div>
);

export default Loading;
