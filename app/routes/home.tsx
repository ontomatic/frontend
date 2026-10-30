import { FileUploadForm } from "~/features/upload/file-upload-form";

export const meta = () => [{ title: "파일 업로드" }];

const Home = () => (
  <main className="page-shell">
    <section className="panel" aria-labelledby="upload-title">
      <h1 id="upload-title">파일 업로드</h1>
      <FileUploadForm />
    </section>
  </main>
);

export default Home;
