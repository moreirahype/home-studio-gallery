import Link from "next/link";

export default function Home() {
  return (
    <main className="landing">
      <div className="landing-card">
        <span className="eyebrow">HOME STUDIO</span>
        <h1>Sua galeria está pronta.</h1>
        <p>
          Suas fotos já estão esperando por você. Escolha suas favoritas e
          aproveite condições especiais para levar mais momentos.
        </p>
        <Link className="primary-button" href="/g/demo">
          Ver minha galeria
        </Link>
      </div>
    </main>
  );
}
