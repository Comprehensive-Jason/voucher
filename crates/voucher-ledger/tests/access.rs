use voucher_ledger::access::{authorized, new_code};

#[test]
fn without_a_code_everything_is_allowed() {
    assert!(authorized(None, None));
}

#[test]
fn with_a_code_only_the_matching_bearer_header_is_allowed() {
    let code = Some("VCHR-ABCD-EFGH-JKMN-PQRS");

    assert!(authorized(code, Some("Bearer VCHR-ABCD-EFGH-JKMN-PQRS")));
    assert!(!authorized(code, Some("Bearer VCHR-ABCD-EFGH-JKMN-PQRT")));
    assert!(!authorized(code, Some("VCHR-ABCD-EFGH-JKMN-PQRS")));
    assert!(!authorized(code, None));
}

#[test]
fn new_codes_are_readable_and_different() {
    let (a, b) = (new_code(), new_code());

    assert_ne!(a, b);
    assert_eq!(a.len(), 24);
    assert!(a.starts_with("VCHR-"));
    assert!(
        a.chars()
            .all(|c| c == '-' || c.is_ascii_uppercase() || c.is_ascii_digit())
    );
}

mod coach {
    use voucher_ledger::access::{Access, access, coach_allows};

    const CODE: Option<&str> = Some("VCHR-AAAA-AAAA-AAAA-AAAA");
    const COACH: Option<&str> = Some("VCHR-CCCC-CCCC-CCCC-CCCC");

    #[test]
    fn each_code_gets_its_own_access() {
        assert_eq!(
            access(CODE, COACH, Some("Bearer VCHR-AAAA-AAAA-AAAA-AAAA")),
            Some(Access::Full)
        );
        assert_eq!(
            access(CODE, COACH, Some("Bearer VCHR-CCCC-CCCC-CCCC-CCCC")),
            Some(Access::Coach)
        );
        assert_eq!(
            access(CODE, COACH, Some("Bearer VCHR-CCCC-CCCC-CCCC-CCCD")),
            None
        );
        assert_eq!(
            access(CODE, None, Some("Bearer VCHR-CCCC-CCCC-CCCC-CCCC")),
            None
        );
        assert_eq!(access(CODE, COACH, None), None);
        // A Ledger without a code allows everything, as before.
        assert_eq!(access(None, None, None), Some(Access::Full));
    }

    #[test]
    fn the_coach_reads_sets_goals_and_changes_only_the_daily_goal() {
        for path in [
            "/status",
            "/history",
            "/day",
            "/goals",
            "/insights",
            "/markers",
            "/export.json",
        ] {
            assert!(coach_allows("GET", path, false), "{path}");
        }
        assert!(coach_allows("POST", "/goal", false));
        assert!(coach_allows("POST", "/goal/remove", false));
        assert!(coach_allows("POST", "/change", true));
        assert!(!coach_allows("POST", "/change", false));
        for path in [
            "/redeem",
            "/check-in",
            "/report",
            "/usage",
            "/sleep",
            "/calendar",
            "/calendars",
            "/marker",
            "/marker/remove",
            "/verdict",
            "/reason",
            "/cancel",
            "/setup",
            "/token",
            "/grace/end",
            "/experiment",
            "/experiment/end",
            "/insights/dismiss",
            "/test/credit",
        ] {
            assert!(!coach_allows("POST", path, false), "{path}");
        }
        assert!(!coach_allows("DELETE", "/goal", false));
    }
}

/// The running Ledger, over HTTP: the coach code gets 403 for anything
/// outside its scope, and the Ledger's own code still gets everything.
mod over_http {
    use std::{
        io::{Read, Write},
        net::{TcpListener, TcpStream},
        process::{Child, Command},
        time::{Duration, Instant},
    };

    const CODE: &str = "VCHR-AAAA-AAAA-AAAA-AAAA";
    const COACH: &str = "VCHR-CCCC-CCCC-CCCC-CCCC";

    struct Running {
        child: Child,
        port: u16,
        _dir: TempDir,
    }
    impl Drop for Running {
        fn drop(&mut self) {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
    }

    struct TempDir(std::path::PathBuf);
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn start(coach_file: Option<&str>) -> Running {
        let port = TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        let dir = std::env::temp_dir().join(format!(
            "voucher-ledger-access-{port}-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("access.code"), CODE).unwrap();
        if let Some(coach) = coach_file {
            std::fs::write(dir.join("access.coach.code"), coach).unwrap();
        }
        let child = Command::new(env!("CARGO_BIN_EXE_voucher-ledger"))
            .env("VOUCHER_DATA_DIR", &dir)
            .env("VOUCHER_LISTEN", format!("127.0.0.1:{port}"))
            .env("VOUCHER_TIME_ZONE", "UTC")
            .env("VOUCHER_POLL_MINUTES", "1000")
            .env_remove("VOUCHER_ACCESS_CODE")
            .env_remove("VOUCHER_COACH_CODE")
            .stderr(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let running = Running {
            child,
            port,
            _dir: TempDir(dir),
        };
        let deadline = Instant::now() + Duration::from_secs(20);
        while TcpStream::connect(("127.0.0.1", port)).is_err() {
            assert!(Instant::now() < deadline, "the Ledger didn't start");
            std::thread::sleep(Duration::from_millis(50));
        }
        running
    }

    /// The status code of one request.
    fn call(port: u16, method: &str, path: &str, code: &str, body: &str) -> u16 {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        write!(
            s,
            "{method} {path} HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {code}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
        .unwrap();
        let mut reply = String::new();
        s.read_to_string(&mut reply).unwrap();
        reply.split(' ').nth(1).unwrap().parse().unwrap()
    }

    #[test]
    fn the_coach_code_is_refused_outside_its_scope() {
        let ledger = start(Some(COACH));
        let p = ledger.port;

        assert_eq!(call(p, "GET", "/status", COACH, ""), 200);
        assert_eq!(call(p, "GET", "/history?days=7", COACH, ""), 200);
        assert_eq!(call(p, "GET", "/goals", COACH, ""), 200);
        assert_eq!(call(p, "GET", "/insights", COACH, ""), 200);
        let focus = r#"{"measure":"focus","direction":"at_least","target":90,"period":"day"}"#;
        assert_eq!(call(p, "POST", "/goal", COACH, focus), 200);
        assert_eq!(
            call(p, "POST", "/goal/remove", COACH, r#"{"id":"g1"}"#),
            200
        );
        assert_eq!(
            call(p, "POST", "/change", COACH, r#"{"DailyGoal":10}"#),
            200
        );

        assert_eq!(
            call(p, "POST", "/change", COACH, r#"{"UnlockMinutes":30}"#),
            403
        );
        assert_eq!(
            call(p, "POST", "/change", COACH, r#"{"BankLimit":40}"#),
            403
        );
        assert_eq!(call(p, "POST", "/redeem", COACH, ""), 403);
        assert_eq!(call(p, "POST", "/check-in?device=coach", COACH, ""), 403);
        assert_eq!(call(p, "POST", "/marker", COACH, r#"{"text":"x"}"#), 403);
        assert_eq!(call(p, "POST", "/experiment", COACH, "{}"), 403);
        assert_eq!(call(p, "POST", "/insights/dismiss", COACH, "{}"), 403);
        assert_eq!(call(p, "POST", "/grace/end", COACH, ""), 403);

        // The Ledger's own code still does everything.
        assert_eq!(
            call(p, "POST", "/change", CODE, r#"{"UnlockMinutes":30}"#),
            200
        );
        assert_eq!(call(p, "POST", "/marker", CODE, r#"{"text":"x"}"#), 200);
        // Any other code is turned away before scope matters.
        assert_eq!(
            call(p, "GET", "/status", "VCHR-ZZZZ-ZZZZ-ZZZZ-ZZZZ", ""),
            401
        );
    }

    #[test]
    fn an_empty_coach_file_gets_a_fresh_code_and_no_file_means_no_coach() {
        let ledger = start(Some(""));
        let made = std::fs::read_to_string(ledger._dir.0.join("access.coach.code")).unwrap();
        let made = made.trim();
        assert!(made.starts_with("VCHR-") && made != CODE);
        assert_eq!(call(ledger.port, "GET", "/goals", made, ""), 200);
        assert_eq!(call(ledger.port, "POST", "/redeem", made, ""), 403);

        let without = start(None);
        assert_eq!(call(without.port, "GET", "/goals", COACH, ""), 401);
    }
}
