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

      <div className="mt-[4px] inline-block rounded-2xl bg-purple-600 px-10 py-5 text-2xl font-bold text-white shadow-lg transition hover:bg-purple-700 active:scale-[0.98]">
        Here is my Toki
      </div>
    </div>
  );
}
