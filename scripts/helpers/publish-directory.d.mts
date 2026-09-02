// SPDX-License-Identifier: Apache-2.0

export interface PublishGeneratedDirectoryOptions {
    attempts?: number;
    wait?: (milliseconds: number) => Promise<void>;
    rename?: (source: string, destination: string) => void;
}

export interface PublishGeneratedDirectoryResult {
    attempts: number;
}

export function publishGeneratedDirectory(
    source: string,
    destination: string,
    options?: PublishGeneratedDirectoryOptions
): Promise<PublishGeneratedDirectoryResult>;
