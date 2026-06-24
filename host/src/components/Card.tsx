import type { ReactNode } from "react";

type CardProps = {
  title: string;
  description: string;
  icon: ReactNode;
  className?: string;
};

export function Card({ title, description, icon, className = "" }: CardProps) {
  return (
    <article
      className={`group rounded-sm border border-gold/30 bg-cream p-6 transition-all duration-300 hover:-translate-y-1 hover:border-gold hover:shadow-lg ${className}`}
    >
      <div className="mb-4 text-gold transition-transform duration-300 group-hover:scale-110">
        {icon}
      </div>
      <h3 className="font-serif text-xl text-navy mb-2">{title}</h3>
      <p className="text-sm leading-relaxed text-charcoal/80">{description}</p>
    </article>
  );
}
