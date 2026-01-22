{ pkgs, ... }: {

  # Which nixpkgs channel to use.
  channel = "stable-25.05"; # or "unstable"

  # Use https://search.nixos.org/packages to find packages
  packages = [
    pkgs.nodejs_20
    pkgs.bun
    pkgs.lazygit
    pkgs.turbo
    pkgs.git-lfs
    pkgs.biome
  ];
}