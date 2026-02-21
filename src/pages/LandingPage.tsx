import { useTheme } from "../hooks/useTheme";
import { Link } from "react-router-dom";
import { Sun, Moon, BookOpen, Languages, Vault, Users } from "lucide-react";

const features = [
  {
    icon: BookOpen,
    title: "Read Manga",
    description:
      "Browse and read manga chapters with a clean, distraction-free reader experience.",
  },
  {
    icon: Languages,
    title: "Instant Translation",
    description:
      "Select any text panel and get instant translations powered by AI — no app switching needed.",
  },
  {
    icon: Vault,
    title: "Word Vault",
    description:
      "Save words and phrases you want to remember. Build your vocabulary as you read.",
  },
  {
    icon: Users,
    title: "Translator Workflow",
    description:
      "Dedicated dashboard for translators to upload chapters and manage translations efficiently.",
  },
];

export default function LandingPage() {
  const { isDark, toggleTheme } = useTheme();

  const logoSrc = isDark
    ? "/IMG/branding/mekai-logo-dark.svg"
    : "/IMG/branding/mekai-logo-light.svg";

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-black/10 dark:border-white/10 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 group"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <img src={logoSrc} alt="Mekai" className="h-8 w-auto transition-transform group-hover:scale-105" />
            <span className="text-base font-semibold tracking-tight">Mekai</span>
          </Link>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-black/5 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <Link
              to="/auth"
              className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
            >
              Log In
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-6 py-24 text-center">
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6 leading-tight">
            Read manga.{" "}
            <span className="text-indigo-600 dark:text-indigo-400">
              Learn as you go.
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-10">
            Mekai lets you read manga and instantly translate panels — saving
            words to your personal vault as you discover them.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/auth"
              className="px-6 py-3 rounded-xl text-base font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
            >
              Get Started
            </Link>
            <a
              href="#features"
              className="px-6 py-3 rounded-xl text-base font-semibold border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              Learn More
            </a>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="max-w-6xl mx-auto px-6 pb-24">
          <h2 className="text-3xl font-bold text-center mb-12 tracking-tight">
            How It Works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="p-6 rounded-2xl bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 flex flex-col gap-4"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Icon size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-base mb-1">{title}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-black/10 dark:border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-slate-500 dark:text-slate-400">
          <span>© {new Date().getFullYear()} Mekai. All rights reserved.</span>
          <span>Built for manga readers and language learners.</span>
        </div>
      </footer>
    </div>
  );
}
