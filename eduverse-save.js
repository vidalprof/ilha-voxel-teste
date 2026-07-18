/* ============================================================================
 * EduVerse — Camada de SAVE/LOAD plugavel (offline-first + Firebase RTDB)
 * ----------------------------------------------------------------------------
 * - OFFLINE-FIRST: sempre grava/le do localStorage (funciona sem internet).
 * - NUVEM (opcional): espelha no Firebase Realtime Database via API REST
 *   (XMLHttpRequest, ES5 puro -> roda em navegador antigo; sem o SDK pesado).
 * - O jogo NUNCA depende do Firebase pra rodar (regra de ouro).
 *
 * SEGURANCA (honesto): o apiKey do Firebase Web e PUBLICO por design. Quem
 * protege os dados sao as REGRAS do Realtime Database (ver eduverse/lib/
 * REGRAS-FIREBASE.txt). Sem regras boas, o banco fica aberto.
 *
 * Modelo de dados: /turmas/<turma>/alunos/<aluno> = { nome, progresso, ... }
 * ==========================================================================*/
(function (glob) {
  "use strict";

  // Config Web do projeto educaverso-73b1a (publico por design).
  var CFG = {
    databaseURL: "https://educaverso-73b1a-default-rtdb.firebaseio.com",
    projectId: "educaverso-73b1a"
  };

  function _lsKey(turma, aluno) { return "edusave_" + turma + "_" + aluno; }

  function _sanitiza(s) {
    // chaves do RTDB nao aceitam . # $ [ ] / — troca por _
    return String(s == null ? "" : s).replace(/[.#$\[\]\/]/g, "_").trim() || "anon";
  }

  function _online() {
    try { return (typeof navigator === "undefined") || navigator.onLine !== false; }
    catch (e) { return true; }
  }

  // --- REST do Realtime Database (PUT grava, GET le) ---
  function _rtdbURL(turma, aluno) {
    return CFG.databaseURL + "/turmas/" + encodeURIComponent(_sanitiza(turma)) +
      "/alunos/" + encodeURIComponent(_sanitiza(aluno)) + ".json";
  }

  function _xhr(method, url, body, onok, onerr) {
    // trava anti-duplo: numa falha de rede o navegador dispara onreadystatechange
    // (status 0) E onerror -> o callback rodava 2x (montava a cena 2x, perdia o nome).
    var pronto = false;
    function _ok(t) { if (pronto) return; pronto = true; onok && onok(t); }
    function _err(e) { if (pronto) return; pronto = true; onerr && onerr(e); }
    try {
      var x = new XMLHttpRequest();
      x.open(method, url, true);
      x.timeout = 8000;
      x.onreadystatechange = function () {
        if (x.readyState === 4) {
          if (x.status >= 200 && x.status < 300) { _ok(x.responseText); }
          else { _err("HTTP " + x.status + ": " + (x.responseText || "").slice(0, 160)); }
        }
      };
      x.ontimeout = function () { _err("timeout"); };
      x.onerror = function () { _err("erro de rede"); };
      if (body != null) { x.setRequestHeader("Content-Type", "application/json"); x.send(body); }
      else { x.send(); }
    } catch (e) { _err(String(e)); }
  }

  var EduSave = {
    /* Permite trocar o config (ex.: outro projeto) sem editar o arquivo. */
    init: function (cfg) { if (cfg && cfg.databaseURL) { CFG.databaseURL = cfg.databaseURL; CFG.projectId = cfg.projectId || CFG.projectId; } return EduSave; },

    /* Grava: SEMPRE local, e espelha na nuvem se online (best-effort). */
    salvar: function (turma, aluno, dados, cb) {
      var reg = { nome: (dados && dados.nome) || aluno, turma: turma, atualizado_em: (new Date()).toISOString(), dados: dados || {} };
      try { localStorage.setItem(_lsKey(turma, aluno), JSON.stringify(reg)); } catch (e) {}
      if (_online()) {
        _xhr("PUT", _rtdbURL(turma, aluno), JSON.stringify(reg),
          function () { cb && cb(null, { local: true, nuvem: true }); },
          function (err) { cb && cb(null, { local: true, nuvem: false, aviso: err }); }); // nuvem falhou != erro (local ok)
      } else { cb && cb(null, { local: true, nuvem: false, aviso: "offline" }); }
    },

    /* Carrega: tenta a nuvem (mais recente); se falhar/offline, usa o local. */
    carregar: function (turma, aluno, cb) {
      function _local() { try { var v = localStorage.getItem(_lsKey(turma, aluno)); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
      if (_online()) {
        _xhr("GET", _rtdbURL(turma, aluno), null,
          function (txt) { var d = null; try { d = txt && txt !== "null" ? JSON.parse(txt) : null; } catch (e) {} cb && cb(null, d || _local(), { fonte: d ? "nuvem" : "local" }); },
          function () { cb && cb(null, _local(), { fonte: "local" }); });
      } else { cb && cb(null, _local(), { fonte: "local" }); }
    },

    /* Painel do professor: lista os alunos de uma turma (GET da nuvem). */
    listarTurma: function (turma, cb) {
      var url = CFG.databaseURL + "/turmas/" + encodeURIComponent(_sanitiza(turma)) + "/alunos.json";
      _xhr("GET", url, null,
        function (txt) { var d = null; try { d = txt && txt !== "null" ? JSON.parse(txt) : {}; } catch (e) { d = {}; } cb && cb(null, d || {}); },
        function (err) { cb && cb(err, null); });
    }
  };

  glob.EduSave = EduSave;
})(typeof window !== "undefined" ? window : this);
