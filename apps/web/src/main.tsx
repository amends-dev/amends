import { render } from "solid-js/web";
import "@amends/ui/fonts";
import "@amends/ui/styles";
import { App } from "./app.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("The application mount element is missing.");

render(() => <App />, root);
