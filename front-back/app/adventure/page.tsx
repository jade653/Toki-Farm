export default function AdventurePage() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('/adv_bg.png')",
          backgroundSize: "cover",
        }}
      />

      <h1 className="mb-20 max-w-2xl text-4xl font-bold text-white leading-none [text-shadow:_2px_2px_8px_rgb(0_0_0_/_60%)]">
        The dungeon welcomes only those bonded with a Toki
      </h1>

      <div className="mt-[4px] inline-block rounded-2xl px-10 py-5 text-2xl font-bold text-white shadow-lg transition-transform active:scale-[0.90] bg-gradient-to-b from-purple-600 to-purple-700 border-b-4 border-purple-800 drop-shadow-[0_2px_0_rgba(0,0,0,0.6)]">
        Here is my Toki
      </div>
    </div>
  );
}
