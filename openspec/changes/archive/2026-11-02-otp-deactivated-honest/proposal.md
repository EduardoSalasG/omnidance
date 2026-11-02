# otp-deactivated-honest

## Why

Una cuenta con baja lógica que ingresa su OTP consumía el código y recibía "Código inválido o expirado" (el catch uniforme tragaba "cuenta desactivada"). El mensaje engañaba y quemaba el OTP: tras reactivar, el código ya no servía.

## What Changes

- `verifyOtp` chequea `person.deletedAt` tras validar el código y ANTES de consumirlo: lanza "account deactivated" sin consumir (sin leak: solo se alcanza con código válido = posesión del correo probada).
- `otp/verify` responde 401 con mensaje real "Tu cuenta está desactivada. Escríbenos a soporte@omnidance.tech" para ese caso; el uniforme se mantiene para el resto.
