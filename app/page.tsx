import Link from "next/link";

export default function Home() {
  return (
    <main className="landing">
      <div className="landing-card">
        <span className="eyebrow">HOME STUDIO</span>
        <h1>Suas melhores fotos estão quase prontas.</h1>
        <p>
          Esta é a base da nova experiência: geração automática, escolha das
          favoritas e liberação após o Pix.
        </p>
        <Link className="primary-button" href="/g/demo">
          Abrir galeria demonstrativa
        </Link>
      </div>
    </main>
  );
}
