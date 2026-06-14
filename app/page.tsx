import Link from "next/link";

export default function Home() {
  return (
    <main className="landing">
      <div className="landing-card">
        <span className="eyebrow">HOME STUDIO</span>
        <h1>Seu ensaio por apenas R$ 4,90.</h1>
        <p>
          Receba uma galeria com 20 opções, escolha sua foto incluída e compre
          outras favoritas com desconto progressivo.
        </p>
        <Link className="primary-button" href="/g/demo">
          Abrir galeria demonstrativa
        </Link>
      </div>
    </main>
  );
}
