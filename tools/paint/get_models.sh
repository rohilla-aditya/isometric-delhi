#!/usr/bin/env bash
# Fetch the FLUX.1 [schnell] painter's weights (about 10 GB) into $FLUX_DIR
# (default ~/models/flux) and check each against its known SHA-256.
#   FLUX.1 [schnell] transformer, 4-bit GGUF  (city96, Apache 2.0)
#   T5-XXL encoder, 4-bit GGUF                (city96, Apache 2.0)
#   CLIP-L text encoder                        (comfyanonymous, MIT)
#   FLUX autoencoder, a mirror of black-forest-labs/FLUX.1-schnell ae.safetensors (Apache 2.0)
set -euo pipefail
DIR="${FLUX_DIR:-$HOME/models/flux}"
mkdir -p "$DIR"
HF=https://huggingface.co
get() { # file url sha256
  if [ -f "$DIR/$1" ] && echo "$3  $DIR/$1" | sha256sum -c --quiet 2>/dev/null; then return; fi
  curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors -o "$DIR/$1.part" "$2"
  echo "$3  $DIR/$1.part" | sha256sum -c --quiet
  mv "$DIR/$1.part" "$DIR/$1"
}
get flux1-schnell-Q4_K_S.gguf "$HF/city96/FLUX.1-schnell-gguf/resolve/main/flux1-schnell-Q4_K_S.gguf" SHA_FLUX & pids=($!)
get t5-Q4_K_M.gguf "$HF/city96/t5-v1_1-xxl-encoder-gguf/resolve/main/t5-v1_1-xxl-encoder-Q4_K_M.gguf" SHA_T5 & pids+=($!)
get clip_l.safetensors "$HF/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors" SHA_CLIP & pids+=($!)
get ae.safetensors "$HF/ffxvs/vae-flux/resolve/main/ae.safetensors" SHA_AE & pids+=($!)
for p in "${pids[@]}"; do wait "$p"; done  # any failed download stops the script
ls -la "$DIR"
