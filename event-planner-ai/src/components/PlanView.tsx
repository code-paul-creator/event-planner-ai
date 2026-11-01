"use client";

import { useId, useState, type Ref } from "react";
import { formatDate, formatMoney } from "@/lib/format";
import type { Plan } from "@/lib/plan";

interface Props {
  plan: Plan;
  headingRef?: Ref<HTMLHeadingElement>;
}

export function PlanView({ plan, headingRef }: Props) {
  const uid = useId();
  const [done, setDone] = useState<Set<number>>(new Set());
  const { meta, budget } = plan;

  function toggle(index: number) {
    setDone((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const money = (value: number) => formatMoney(value, budget.currency);
  const when =
    meta.daysUntil <= 0
      ? "today"
      : meta.daysUntil === 1
        ? "tomorrow"
        : `in ${meta.daysUntil} days`;

  return (
    <article className="plan" aria-labelledby={`${uid}-title`}>
      <header className="plan-header">
        <h2 id={`${uid}-title`} ref={headingRef} tabIndex={-1}>
          {meta.title}
        </h2>
        <p className="meta">
          {formatDate(meta.date)} ({when}) &middot; {meta.guestCount} guests
          {meta.location ? ` · ${meta.location}` : ""}
        </p>
        <button type="button" className="button secondary no-print" onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </header>

      <section aria-labelledby={`${uid}-summary`} className="card">
        <h3 id={`${uid}-summary`}>Overview</h3>
        <p>{plan.summary}</p>
      </section>

      <section aria-labelledby={`${uid}-budget`} className="card">
        <h3 id={`${uid}-budget`}>Budget</h3>
        <p>
          Total {money(budget.total)} &middot; about {money(budget.perGuest)} per guest
        </p>
        <div className="table-wrap" role="region" aria-labelledby={`${uid}-budget`} tabIndex={0}>
          <table>
            <caption className="visually-hidden">Suggested budget split by category</caption>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col" className="num">
                  Share
                </th>
                <th scope="col" className="num">
                  Amount
                </th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {budget.lines.map((line) => (
                <tr key={line.category}>
                  <th scope="row">{line.category}</th>
                  <td className="num">{line.percent}%</td>
                  <td className="num">{money(line.amount)}</td>
                  <td>{line.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby={`${uid}-timeline`} className="card">
        <h3 id={`${uid}-timeline`}>Timeline</h3>
        <p aria-live="polite" className="hint">
          {done.size} of {plan.timeline.length} tasks done
        </p>
        <ol className="checklist">
          {plan.timeline.map((item, index) => {
            const id = `${uid}-task-${index}`;
            return (
              <li key={id}>
                <input
                  id={id}
                  type="checkbox"
                  checked={done.has(index)}
                  onChange={() => toggle(index)}
                />
                <label htmlFor={id}>
                  <span className="task-title">{item.task}</span>
                  <span className="task-date">
                    Due {formatDate(item.dueDate)}
                    {item.compressed ? " (urgent: start now)" : ""}
                  </span>
                  <span className="task-details">{item.details}</span>
                </label>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby={`${uid}-vendors`} className="card">
        <h3 id={`${uid}-vendors`}>Vendor checklist</h3>
        <ul className="vendors">
          {plan.vendors.map((vendor) => (
            <li key={vendor.vendor}>
              <h4>
                {vendor.vendor}{" "}
                <span className={`badge badge-${vendor.priority}`}>{vendor.priority} priority</span>
              </h4>
              <p className="hint">Questions to ask:</p>
              <ul>
                {vendor.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby={`${uid}-ideas`} className="card">
        <h3 id={`${uid}-ideas`}>Ideas for you</h3>
        <ul className="ideas">
          {plan.ideas.map((idea) => (
            <li key={idea.title}>
              <h4>{idea.title}</h4>
              <p>{idea.description}</p>
            </li>
          ))}
        </ul>
      </section>

      {plan.tips.length > 0 && (
        <section aria-labelledby={`${uid}-tips`} className="card">
          <h3 id={`${uid}-tips`}>Tips</h3>
          <ul>
            {plan.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
