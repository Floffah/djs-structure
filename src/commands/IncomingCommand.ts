import {
    ApplicationCommandOption,
    ApplicationCommandOptionChoice,
    BufferResolvable,
    CommandInteraction,
    CommandInteractionOption,
    CommandInteractionOptionResolver,
    DMChannel,
    FileOptions,
    Guild,
    GuildMember,
    Message,
    MessageAttachment,
    MessageEmbed,
    NewsChannel,
    PartialDMChannel,
    Snowflake,
    TextChannel,
    ThreadChannel,
    User,
} from "discord.js";
import { Stream } from "stream";
import { ManagedClient } from "../client/ManagedClient";
import { Command } from "../structure/Command";
import { ManagableClient } from "../client/ManagableClient";

export type IncomingCommandOpts =
    | IncomingInteractionCommandOptions
    | IncomingMessageCommandOptions;

export interface BaseIncomingCommandOptions {
    type: "interaction" | "message";
    client: ManagedClient | ManagableClient;
    command: Command;
}

export interface IncomingInteractionCommandOptions
    extends BaseIncomingCommandOptions {
    type: "interaction";
    rawInteraction: CommandInteraction;
    deferred?: boolean;
}

export interface IncomingMessageCommandOptions
    extends BaseIncomingCommandOptions {
    type: "message";
    message: Message;
    content: string;
    deferredMessage?: Message;
}

export interface IncomingCommandMessageOptions {
    debug?: { [k: string]: string | number | boolean };
    embeds?: MessageEmbed[];
    files?: (FileOptions | BufferResolvable | Stream | MessageAttachment)[];
}

export class IncomingCommand {
    rawInteraction?: CommandInteraction;
    guild?: Guild;
    channel?:
        | TextChannel
        | DMChannel
        | NewsChannel
        | PartialDMChannel
        | ThreadChannel;
    message?: Message;
    user: User;
    member?: GuildMember;
    content?: string;
    client: ManagedClient | ManagableClient;
    options: CommandInteractionOptionResolver; //Collection<string, CommandInteractionOption>;
    command: Command;
    deferred?: boolean;
    deferredMessage?: Message;
    initialMessage?: Message;

    // the constructor is a (working) mess that i wont comment because its not necessary, this just populates the info
    constructor(i: IncomingCommandOpts) {
        this.client = i.client;
        this.command = i.command;
        if (i.type === "interaction") {
            this.rawInteraction = i.rawInteraction;
            if (this.rawInteraction.guild)
                this.guild = this.rawInteraction.guild;
            this.user = this.rawInteraction.user;
            if (this.rawInteraction.member) {
                if (
                    !Object.prototype.hasOwnProperty.call(
                        this.rawInteraction.member,
                        "bannable",
                    ) &&
                    this.guild
                ) {
                    this.rawInteraction.member = this.rawInteraction
                        .member as GuildMember;
                    const found = this.guild.members.resolve(
                        this.rawInteraction.user.id,
                    );
                    if (found) this.member = found;
                } else if (
                    Object.prototype.hasOwnProperty.call(
                        this.rawInteraction.member,
                        "bannable",
                    )
                ) {
                    this.rawInteraction.member = this.rawInteraction
                        .member as GuildMember;
                    this.member = this.rawInteraction.member;
                }
            }
            this.options = this.rawInteraction.options;
            this.channel = this.rawInteraction.channel ?? undefined;
            this.deferred = i.deferred;
        } else if (i.type === "message") {
            this.message = i.message;
            this.content = i.content;
            this.guild = i.message.guild ?? undefined;
            this.channel = i.message.channel;
            this.user = i.message.author;
            this.member = i.message.member ?? undefined;
            this.deferred = false;
            this.deferredMessage = i.deferredMessage;
        }
    }

    /**
     * Generates a usage string for a file
     * @param opts
     * @param group
     * @param name
     */
    getUsage(opts: ApplicationCommandOption[], group?: string, name?: string) {
        // basic usage
        let usage = `!${name ?? this.command.name}`;
        if (group) {
            usage += ` ${group}`;
            for (const opt of opts) {
                if (opt.type === "SUB_COMMAND" && opt.name === group) {
                    opts = opt.options as ApplicationCommandOption[];
                    break;
                }
            }
        }

        for (const opt of opts) {
            let val = opt.name;

            if (opt.type !== "STRING") {
                let name = "";

                if (opt.type === "INTEGER") name = "number";
                else if (opt.type === "BOOLEAN") name = "yes/no";
                else if (opt.type === "ROLE") name = "@role/id";
                else if (opt.type === "USER") name = "@user/id";
                else if (opt.type === "CHANNEL") name = "#channel/id";
                else name = opt.type.toLowerCase();

                val += ` (${name})`;
            }

            if (opt.required) {
                usage += ` <${val}>`;
            } else {
                usage += ` [${val}]`;
            }
        }
        return usage;
    }

    /**
     * Parses a commands args into valid interaction options (for compatibility and efficiency)
     */
    async parseCommand() {
        if (
            typeof this.content !== "string" ||
            typeof this.message === "undefined"
        )
            throw new Error("Must be a message based command");

        let finallist: CommandInteractionOption[] = [];

        // options to use
        let cmdopts = this.command.options ?? [];
        // how many args are required
        let argsneeded = 0;

        // on demand argsneeded calculation (to support groups more efficiently)
        const calcNeeded = () => {
            argsneeded = 0;
            for (const opt of cmdopts) {
                if (opt.required || opt.type === "SUB_COMMAND") argsneeded += 1;
            }
        };
        calcNeeded();

        // if the message contains arguments
        if (
            this.content !== "" &&
            !/^\s+$/.test(this.content) &&
            this.command.options
        ) {
            // commands groups mapped to indexes in the cmdopts variable
            const groups: { [name: string]: number } = {};
            // commands groups mapped to what options they take
            const groupopts: {
                [name: string]: ApplicationCommandOption[] | undefined;
            } = {};
            // the current group being parsed
            let group: string | undefined = undefined;

            // for each opt, if the opt is group relating, populate groups and groupopts
            for (let i = 0; i < cmdopts.length; i++) {
                const opt = cmdopts[i];
                if (opt.type === "SUB_COMMAND") {
                    groups[opt.name.toLowerCase()] = i;
                    groupopts[opt.name.toLowerCase()] = opt.options;
                }
            }

            // the command args
            const args = this.content.split(" ");
            // index of cmdopts
            let optindex = 0;
            // if a multi arg ("some sentence" rather than aSingleArgument) is being parsed, the option name, and the content found already
            let stringing: { str: string; name: string } | undefined =
                undefined;
            // if the loop ran into the last option that has a value, keep adding content until the end of the args, and the last option's name
            let restofstring: { str: string; name: string } | undefined =
                undefined;

            // for each argument
            for (let argindex = 0; argindex < args.length; argindex++) {
                const arg = args[argindex];

                // if the argument is just whitespace
                if (arg === "" || /^\s+$/.test(arg)) continue;
                // if parsing the last option and it maps to multiple arguments
                if (restofstring) {
                    if (argindex + 1 >= args.length) {
                        // found the end
                        finallist.push({
                            name: restofstring.name,
                            type: "STRING",
                            value: `${restofstring.str} ${arg}`,
                        });
                        optindex += 1;
                    } else {
                        // still parsing
                        restofstring.str += ` ${arg}`;
                    }
                    // if found a multi arg string ("some sentence" rather than aSingleArgument)
                } else if (stringing) {
                    if (arg.endsWith('"')) {
                        // found the end
                        finallist.push({
                            name: stringing.name,
                            type: "STRING",
                            value: `${stringing.str} ${arg.replace(/"$/, "")}`,
                        });
                        stringing = undefined;
                        optindex += 1;
                    } else {
                        // still parsing
                        stringing.str += ` ${arg}`;
                    }
                    // if the argument is a group and groups are available
                } else if (
                    optindex <= 0 &&
                    typeof groups[arg.toLowerCase()] !== "undefined"
                ) {
                    group = arg.toLowerCase();
                    cmdopts = groupopts[group] ?? [];
                    // re-calculate args needed based on opts accepted by the command group
                    calcNeeded();
                    // if there is still opts available
                } else if (cmdopts[optindex]) {
                    const opt = cmdopts[optindex];
                    // if the arg is a mention
                    if (/<@!?[0-9]+>/.test(arg) && opt.type === "USER") {
                        const id = arg.replace(/(^<@!?|>$)/g, "");

                        // fetch it and set option if exists
                        let fetched: GuildMember | undefined = undefined;
                        let fetcheduser: User | undefined = undefined;

                        try {
                            fetched = await this.message.guild?.members.fetch(
                                id as Snowflake,
                            );
                        } catch (e) {
                            fetched = undefined;
                            try {
                                fetcheduser = await this.client.users.fetch(
                                    id as Snowflake,
                                );
                            } catch (e) {
                                fetcheduser = undefined;
                            }
                        }

                        if (!fetched && !fetcheduser)
                            throw `Could not find user ${arg} for argument ${
                                opt.name
                            }\n\n${this.getUsage(cmdopts, group)}`;

                        finallist.push({
                            name: opt.name,
                            type: "USER",
                            member: fetched,
                            user: fetched?.user ?? fetcheduser,
                        });
                        optindex += 1;
                        // if the arg is a role mention
                    } else if (/<@&!?[0-9]+>/.test(arg)) {
                        const id = arg.replace(/(^<@&!?|>$)/g, "");

                        // fetch role and set option if exists
                        const fetched = await this.message.guild?.roles.fetch(
                            id as Snowflake,
                        );
                        if (!fetched)
                            throw `Could not find role ${arg} for argument ${
                                opt.name
                            }\n\n${this.getUsage(cmdopts, group)}`;

                        finallist.push({
                            name: opt.name,
                            type: "ROLE",
                            role: fetched,
                        });
                        optindex += 1;
                        // if the arg is a channel mention
                    } else if (/<#!?[0-9]+>/.test(arg)) {
                        const id = arg.replace(/(^<#!?|>$)/g, "");

                        // fetch channel and set option if exists
                        const fetched =
                            await this.message.guild?.channels.fetch(
                                id as Snowflake,
                            );
                        if (!fetched)
                            throw `Could not find channel ${arg} for argument ${
                                opt.name
                            }\n\n${this.getUsage(cmdopts, group)}`;

                        finallist.push({
                            name: opt.name,
                            type: "CHANNEL",
                            channel: fetched,
                        });
                        optindex += 1;
                        // if the arg is a string id and the next option is a user, role, or channel
                    } else if (
                        /[0-9]+/.test(arg) &&
                        ["USER", "CHANNEL", "ROLE"].includes(opt.type)
                    ) {
                        // if the next option is a user
                        if (opt.type === "USER") {
                            // fetch it and set option if exists
                            let fetched: GuildMember | undefined = undefined;
                            let fetcheduser: User | undefined = undefined;

                            try {
                                fetched =
                                    await this.message.guild?.members.fetch(
                                        arg as Snowflake,
                                    );
                            } catch (e) {
                                fetched = undefined;
                                try {
                                    fetcheduser = await this.client.users.fetch(
                                        arg as Snowflake,
                                    );
                                } catch (e) {
                                    fetcheduser = undefined;
                                }
                            }

                            if (!fetched && !fetcheduser)
                                throw `Could not find user ${arg} for argument ${
                                    opt.name
                                }\n\n${this.getUsage(cmdopts, group)}`;

                            finallist.push({
                                name: opt.name,
                                type: "USER",
                                member: fetched,
                                user: fetched?.user ?? fetcheduser,
                            });
                            optindex += 1;
                            // if the next option is a role
                        } else if (opt.type === "ROLE") {
                            // fetch the role and set option if exists
                            const fetched =
                                await this.message.guild?.roles.fetch(
                                    arg as Snowflake,
                                );
                            if (!fetched)
                                throw `Could not find role ${arg} for argument ${
                                    opt.name
                                }\n\n${this.getUsage(cmdopts, group)}`;

                            finallist.push({
                                name: opt.name,
                                type: "ROLE",
                                role: fetched,
                            });
                            optindex += 1;
                            // if the next option is a channel
                        } else if (opt.type === "CHANNEL") {
                            // fetch channel and set option if xists
                            const fetched =
                                await this.message.guild?.channels.fetch(
                                    arg as Snowflake,
                                );
                            if (!fetched)
                                throw `Could not find channel ${arg} for argument ${
                                    opt.name
                                }\n\n${this.getUsage(cmdopts, group)}`;

                            finallist.push({
                                name: opt.name,
                                type: "CHANNEL",
                                channel: fetched,
                            });
                            optindex += 1;
                            // this else should never be reached, but just in case, throw an error
                        } else {
                            throw `Incorrect value type for ${
                                opt.type
                            }\n\n${this.getUsage(cmdopts, group)}`;
                        }
                        // if the next option is an integer and the arg is a number like 1234 or decimal like 1234.4321
                    } else if (
                        /[0-9]+(\.[0-9]+)?/.test(arg) &&
                        opt.type === "INTEGER"
                    ) {
                        // set the option (allow NaN, command should independently recognise this and fail)
                        finallist.push({
                            name: opt.name,
                            type: "INTEGER",
                            value: parseInt(arg),
                        });
                        optindex += 1;
                        // if the option is anything else (any character excluding whitespace characters (tab, space, carriage return, line feed, etc)
                    } else if (/^\S+/.test(arg)) {
                        if (opt.type === "STRING") {
                            // if the there are no more options but there are more arguments
                            if (
                                optindex + 1 >= cmdopts.length &&
                                argindex + 1 < args.length
                            ) {
                                // start rest of string tracking
                                restofstring = {
                                    str: arg,
                                    name: opt.name,
                                };
                                // if the arg starts with a ", it must be a stringing multi-arg
                            } else if (arg.startsWith('"')) {
                                // start stringing tracking
                                stringing = {
                                    str: arg.replace(/^"/, ""),
                                    name: opt.name,
                                };
                                // if its not a restofstring or stringing arg
                            } else {
                                // make sure its allowed
                                if (opt.choices) {
                                    const raw = opt.choices.map((c) =>
                                        c.name.toLowerCase(),
                                    );
                                    if (!raw.includes(arg.toLowerCase()))
                                        throw `${arg.toLowerCase()} does not exist in choices of ${raw.join(
                                            ", ",
                                        )}`;
                                    else {
                                        // safe to cast as the statement above determines it will exist if we reach this
                                        const choice = opt.choices.find(
                                            (c) =>
                                                c.name.toLowerCase() ===
                                                arg.toLowerCase(),
                                        ) as ApplicationCommandOptionChoice;

                                        // set the option as the choice's set value
                                        finallist.push({
                                            name: opt.name,
                                            type: "STRING",
                                            value: choice.value,
                                        });
                                    }
                                } else {
                                    // set the option as the raw arg
                                    finallist.push({
                                        name: opt.name,
                                        type: "STRING",
                                        value: arg,
                                    });
                                }
                                optindex += 1;
                            }
                            // if the next option is a boolean
                        } else if (opt.type === "BOOLEAN") {
                            // set the boolean acceptiong yes/no true/false y/n without being case sensitive
                            finallist.push({
                                name: opt.name,
                                type: "STRING",
                                value:
                                    arg.toLowerCase() === "yes" ||
                                    arg.toLowerCase() === "true" ||
                                    arg.toLowerCase() === "y",
                            });
                            optindex += 1;
                            // this probably wont be reached, but just in case, throw an error
                        } else {
                            throw `Incorrect value type for ${
                                opt.type
                            }\n\n${this.getUsage(cmdopts, group)}`;
                        }
                        // this also probably wont be reached
                    } else {
                        throw `Incorrect value type for ${
                            opt.type
                        }\n\n${this.getUsage(cmdopts, group)}`;
                    }
                    // somehow there are too many arguments
                } else {
                    throw `Too many arguments\n\n${this.getUsage(
                        cmdopts,
                        group,
                    )}`;
                }
            }

            // tell the user if they didnt provide enough arguments
            if (finallist.length < argsneeded)
                throw `Not enough arguments\n\n${this.getUsage(
                    cmdopts,
                    group,
                )}`;

            // if there is a group, set the final option collection to wrap the group options
            if (group) {
                finallist = [
                    {
                        type: "SUB_COMMAND",
                        name: group,
                        options: finallist,
                    },
                ];
            }
        }

        // just to make sure, the block inside this statement will probably never be executed
        if (finallist.length < argsneeded)
            throw `Not enough arguments\n\n${this.getUsage(cmdopts)}`;

        this.options = new CommandInteractionOptionResolver(
            this.client,
            finallist,
        );
        return;
    }

    async deleteReply() {
        if (
            this.rawInteraction &&
            this.rawInteraction.isCommand() &&
            this.rawInteraction.command
        ) {
            await this.rawInteraction.deleteReply();
        } else if (this.message && this.initialMessage) {
            if (
                this.deferredMessage &&
                this.deferredMessage.id !== this.initialMessage.id
            )
                await this.deferredMessage.delete();
            await this.initialMessage.delete();
        }
    }

    /**
     * Edit a previous reply sent or edit a deferred message
     * @param content
     * @param opts
     */
    async editReply(
        content?: string,
        opts: IncomingCommandMessageOptions = {},
    ) {
        const payload = {
            content: content ?? null,
            embeds: opts.embeds,
            files: opts.files,
        };

        if (
            this.rawInteraction &&
            this.rawInteraction.isCommand() &&
            this.rawInteraction.command
        ) {
            await this.rawInteraction.editReply(payload);
        } else if (this.message && this.initialMessage) {
            await this.initialMessage.edit(payload);
        }
    }

    /**
     * Reply to the original message
     * @param content
     * @param opts
     */
    async reply(content?: string, opts: IncomingCommandMessageOptions = {}) {
        const payload = {
            content: content ?? null,
            embeds: opts.embeds,
            files: opts.files,
        };

        if (
            this.rawInteraction &&
            this.rawInteraction.isCommand() &&
            this.rawInteraction.command
        ) {
            if (this.deferred) {
                await this.rawInteraction.editReply(payload);
            } else {
                await this.rawInteraction.reply(payload);
            }
        } else if (this.message) {
            if (
                this.deferredMessage &&
                this.deferredMessage.editable &&
                this.command.opts.long &&
                this.command.opts.forceLong
            ) {
                this.initialMessage = await this.deferredMessage.edit(payload);
            } else {
                this.initialMessage = await this.message.reply(payload);
            }

            if (this.command.opts.isPublic === false && this.initialMessage) {
                setTimeout(() => {
                    if (this.initialMessage && this.initialMessage.deletable) {
                        this.initialMessage.delete();
                        this.initialMessage = undefined;
                    }
                }, 5000);
            }
        }
    }

    /**
     * Send an error
     * @param reason
     * @param options
     */
    async reject(reason?: string, options: IncomingCommandMessageOptions = {}) {
        await this.reply(
            reason ? "Command rejected: " + reason : undefined,
            options,
        );
    }
}
