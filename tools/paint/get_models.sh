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
get flux1-schnell-Q4_K_S.gguf "$HF/city96/FLUX.1-schnell-gguf/resolve/main/flux1-schnell-Q4_K_S.gguf" 4fd16477b3a5296d0cf722c4b92a9fd7f30d09ac7495826e4465d8de9c9fd973 & pids=($!)
get t5-Q4_K_M.gguf "$HF/city96/t5-v1_1-xxl-encoder-gguf/resolve/main/t5-v1_1-xxl-encoder-Q4_K_M.gguf" 6be2b0b7e2de7cf2919340c88cb802a103a997ce46c53131cec91958c1db1af4 & pids+=($!)
get clip_l.safetensors "$HF/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors" 660c6f5b1abae9dc498ac2d21e1347d2abdb0cf6c0c0c8576cd796491d9a6cdd & pids+=($!)
get ae.safetensors "$HF/ffxvs/vae-flux/resolve/main/ae.safetensors" afc8e28272cd15db3919bacdb6918ce9c1ed22e96cb12c4d5ed0fba823529e38 & pids+=($!)
for p in "${pids[@]}"; do wait "$p"; done  # any failed download stops the script
ls -la "$DIR"
