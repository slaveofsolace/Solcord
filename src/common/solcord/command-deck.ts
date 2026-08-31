// SPDX-License-Identifier: Apache-2.0

export function filterSolcordCommands<T extends {name: string;}>(commands: readonly T[], input: string): T[] {
    const query = input.trim().toLocaleLowerCase();
    if (!query) return [...commands];
    return commands.filter(command => command.name.toLocaleLowerCase().includes(query));
}
