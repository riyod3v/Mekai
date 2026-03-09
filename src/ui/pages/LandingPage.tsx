import { useThemeContext } from "@/context/ThemeContext";
import { Link } from "react-router-dom";
import { Sun, Moon, BookOpen, Languages, Vault, Users, MousePointerClick, Sparkles, Save } from "lucide-react";
import logoDark from "@/assets/IMG/branding/mekai-logo-dark.svg";
import logoLight from "@/assets/IMG/branding/mekai-logo-light.svg";

const features = [
  {
    icon: BookOpen,
    title: "Read Manga",
    description:
      "Browse and read manga chapters with a clean, distraction-free reader experience.",
  },
  {
    icon: Languages,
    title: "OCR Translation",
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

const tutorialSteps = [
  {
    icon: MousePointerClick,
    step: "1",
    title: "Select a Speech Bubble",
    description:
      "Click and drag to crop any speech bubble or text panel in the manga reader. The selection tool makes it easy to capture exactly what you want to translate.",
  },
  {
    icon: Sparkles,
    step: "2",
    title: "OCR-Translation",
    description:
      "Once you release, OCR automatically detects the Japanese text and translates it to English. No need to switch apps or copy-paste — everything happens instantly.",
  },
  {
    icon: Save,
    step: "3",
    title: "Save to Word Vault",
    description:
      "Found an interesting word or phrase? Click the save button to add it to your personal Word Vault. Build your vocabulary as you read and review it anytime.",
  },
];

export default function LandingPage() {
  const { isDark, toggleTheme } = useThemeContext();

  const logoSrc = isDark ? logoDark : logoLight;

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
              className="px-4 py-2 rounded-lg text-sm font-medium mekai-primary-bg hover:opacity-90 text-white transition-opacity"
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
              className="px-6 py-3 rounded-xl text-base font-semibold mekai-primary-bg hover:opacity-90 text-white transition-opacity"
            >
              Get Started
            </Link>
            <a
              href="#LearnHowToUse"
              className="px-6 py-3 rounded-xl text-base font-semibold border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              Learn More
            </a>
          </div>
        </section>

        {/* Features */}
        <section className="max-w-6xl mx-auto px-6 pb-24">
          <h2 className="text-3xl font-bold text-center mb-12 tracking-tight">
            Features
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

        {/* How to Use Tutorial */}
        <section id="LearnHowToUse" className="max-w-6xl mx-auto px-6 pb-24">
          <h2 className="text-3xl font-bold text-center mb-12 tracking-tight">
            How to Use
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {tutorialSteps.map(({ icon: Icon, step, title, description }) => (
              <div
                key={step}
                className="relative p-6 rounded-2xl bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/10 dark:hover:shadow-indigo-500/20 hover:-translate-y-1 flex flex-col gap-4"
              >
                <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                  {step}
                </div>
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
        <div className="max-w-6xl mx-auto px-6 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          <span>© {new Date().getFullYear()} Mekai. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
