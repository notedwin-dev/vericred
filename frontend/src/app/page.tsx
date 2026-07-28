export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-center py-32 px-16 bg-white dark:bg-black">
        <div className="flex flex-col items-center gap-6 text-center">
          <h1 className="text-5xl font-bold leading-tight tracking-tight text-black dark:text-zinc-50">
            VeriCred
          </h1>
          <p className="max-w-2xl text-xl leading-8 text-zinc-600 dark:text-zinc-400">
            Blockchain-based academic credential issuance and verification platform
          </p>
          <p className="max-w-2xl text-base leading-7 text-zinc-500 dark:text-zinc-500">
            Secure, transparent, and tamper-proof credential management powered by smart contracts and IPFS.
          </p>
        </div>
      </main>
    </div>
  );
}
