// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";

const root = document.getElementById("app");

if (!root) throw Error("Root element not found");

mount(() => <StartClient />, root);
