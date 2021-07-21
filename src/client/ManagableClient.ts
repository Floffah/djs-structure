import { Client } from "discord.js";
import { Module } from "../structure/Module";
import { Command } from "../structure/Command";

export interface ManagableClient extends Client {
    registerModule: (m: Module) => void;
    registerCommand: (m: Module, c: Command) => void;
}
