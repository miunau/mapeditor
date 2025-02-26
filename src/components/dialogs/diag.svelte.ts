import type { Component } from "svelte";

let dialogs = $state<{ name: string, Component: Component }[]>([]);

export function addDialog(name: string, dialog: Component) {
    if (dialogs.find(d => d.name === name)) {
        return;
    }
    dialogs.push({ name, Component: dialog });
}

export function removeDialog(name: string) {
    const index = dialogs.findIndex(d => d.name === name);
    if (index !== -1) {
        console.log("Removing dialog", name, "at index", index);
        dialogs.splice(index, 1);
    }
}

export function getDialogs() {
    return dialogs;
}
