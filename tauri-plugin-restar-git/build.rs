const COMMANDS: &[&str] = &[
    "git_is_repo",
    "git_init",
    "git_status",
    "git_stage",
    "git_unstage",
    "git_commit",
    "git_log",
    "git_diff_file",
    "git_discard",
    "git_get_remotes",
    "git_push",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
