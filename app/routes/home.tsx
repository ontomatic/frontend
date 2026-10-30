import { ContactForm } from "~/features/contact/contact-form";
import { SystemStatus } from "~/features/system/system-status";

import type { Route } from "./+types/home";

const highlights = [
  {
    title: "React Router framework mode",
    description: "SSR-ready routing with route modules, generated types, loaders, and deployable server output.",
  },
  {
    title: "Product defaults",
    description: "Tailwind CSS v4, TanStack Query, React Hook Form, Zod, ky, TypeScript, oxlint, and oxfmt.",
  },
  {
    title: "Template-first structure",
    description: "Small folders with clear ownership so each generated app can grow without early abstractions.",
  },
];

const stack = ["React 19", "React Router 8", "Tailwind CSS 4", "TanStack Query", "React Hook Form", "Zod", "ky"];

export function meta() {
  return [
    { title: "Frontend Template" },
    {
      content: "A draft frontend starter template built with React Router, Tailwind CSS, and pragmatic defaults.",
      name: "description",
    },
  ];
}

export function loader() {
  return {
    generatedAt: new Date().toISOString(),
    highlights,
    stack,
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="page-shell">
      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">Draft Template</p>
          <h1>Frontend starter for production-lean React apps.</h1>
          <p className="hero-description">
            A focused baseline for apps that need routing, server rendering, data fetching, forms, validation, and a
            maintainable file structure from day one.
          </p>
          <div className="hero-actions" aria-label="Primary commands">
            <code>pnpm dev</code>
            <code>pnpm build</code>
            <code>pnpm typecheck</code>
          </div>
        </div>

        <SystemStatus generatedAt={loaderData.generatedAt} />
      </section>

      <section className="content-grid" aria-label="Template overview">
        {loaderData.highlights.map((item) => (
          <article className="feature-card" key={item.title}>
            <h2>{item.title}</h2>
            <p>{item.description}</p>
          </article>
        ))}
      </section>

      <section className="workspace-grid">
        <div className="panel">
          <div className="section-heading">
            <p className="eyebrow">Stack</p>
            <h2>Included by default</h2>
          </div>
          <ul className="stack-list">
            {loaderData.stack.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <div className="section-heading">
            <p className="eyebrow">Example</p>
            <h2>Typed form baseline</h2>
          </div>
          <ContactForm />
        </div>
      </section>
    </main>
  );
}
