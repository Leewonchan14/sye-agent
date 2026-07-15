import { redirect } from "next/navigation";

const HomePage = () => {
  redirect(`/${crypto.randomUUID()}`);
};

export default HomePage;
