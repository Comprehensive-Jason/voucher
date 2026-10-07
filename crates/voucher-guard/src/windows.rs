//! The Windows-only parts: running as a service, installing it, writing
//! browser policy to the registry, and locking down the data folder.

use std::{
    ffi::OsString,
    path::Path,
    process::Command,
    sync::{Arc, Mutex},
    time::Duration,
};

use windows_service::{
    define_windows_service,
    service::{
        ServiceAccess, ServiceAction, ServiceActionType, ServiceControl, ServiceControlAccept,
        ServiceErrorControl, ServiceExitCode, ServiceFailureActions, ServiceFailureResetPeriod,
        ServiceInfo, ServiceStartType, ServiceState, ServiceStatus, ServiceType,
    },
    service_control_handler::{self, ServiceControlHandlerResult},
    service_dispatcher,
    service_manager::{ServiceManager, ServiceManagerAccess},
};
use winreg::{RegKey, enums::HKEY_LOCAL_MACHINE};

use voucher_guard::Policy;

const NAME: &str = "VoucherGuard";

define_windows_service!(ffi_service_main, service_entry);

pub fn service_main() {
    if let Err(e) = service_dispatcher::start(NAME, ffi_service_main) {
        eprintln!("voucher-guard: not started by Windows ({e})");
    }
}

fn service_entry(_arguments: Vec<OsString>) {
    let stop = Arc::new(Mutex::new(false));
    let stop_flag = Arc::clone(&stop);
    let handler = move |control| match control {
        ServiceControl::Stop | ServiceControl::Shutdown => {
            *stop_flag.lock().unwrap() = true;
            ServiceControlHandlerResult::NoError
        }
        ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
        _ => ServiceControlHandlerResult::NotImplemented,
    };
    let Ok(status) = service_control_handler::register(NAME, handler) else {
        return;
    };
    let report = |state, accept| ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: state,
        controls_accepted: accept,
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    };
    let _ = status.set_service_status(report(
        ServiceState::Running,
        ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
    ));
    crate::run(stop);
    let _ = status.set_service_status(report(ServiceState::Stopped, ServiceControlAccept::empty()));
}

/// Registers the service to start at boot and to restart if it dies.
pub fn install() {
    let manager =
        ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CREATE_SERVICE)
            .expect("run this as an administrator");
    let exe = std::env::current_exe().expect("own path");
    let info = ServiceInfo {
        name: NAME.into(),
        display_name: "Voucher guard".into(),
        service_type: ServiceType::OWN_PROCESS,
        start_type: ServiceStartType::AutoStart,
        error_control: ServiceErrorControl::Normal,
        executable_path: exe,
        launch_arguments: vec!["service".into()],
        dependencies: vec![],
        account_name: None, // LocalSystem
        account_password: None,
    };
    let service = manager
        .create_service(&info, ServiceAccess::CHANGE_CONFIG | ServiceAccess::START)
        .expect("create the service");
    let _ = service.set_description("Keeps Voucher's blocking in force: closes paused programs and writes browser policy unless an Unlock is running.");
    let restart = ServiceAction {
        action_type: ServiceActionType::Restart,
        delay: Duration::from_secs(5),
    };
    let _ = service.update_failure_actions(ServiceFailureActions {
        reset_period: ServiceFailureResetPeriod::After(Duration::from_secs(86400)),
        reboot_msg: None,
        command: None,
        actions: Some(vec![restart.clone(), restart.clone(), restart]),
    });
    let _ = service.start::<&str>(&[]);
    println!("Voucher guard installed and started.");
}

/// Removes the service, clearing the policy it wrote.
pub fn uninstall() {
    let manager = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)
        .expect("run this as an administrator");
    if let Ok(service) = manager.open_service(
        NAME,
        ServiceAccess::STOP | ServiceAccess::DELETE | ServiceAccess::QUERY_STATUS,
    ) {
        let _ = service.stop();
        let _ = service.delete();
    }
    for policy in voucher_guard::policies(&voucher_guard::Decision {
        allowed: true,
        curfew: false,
        released: true,
        unlock_ends_at: None,
        programs: vec![],
        labels: vec![],
        games: false,
        sites: vec![],
    }) {
        write_policy(&policy);
    }
    println!("Voucher guard removed.");
}

/// Writes or clears each policy key, only touching the registry when it differs.
pub fn write_policies(policies: &[Policy]) {
    for policy in policies {
        write_policy(policy);
    }
}

fn write_policy(policy: &Policy) {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if policy.values.is_empty() {
        let _ = hklm.delete_subkey_all(policy.key);
        return;
    }
    let current: Vec<(String, String)> = hklm
        .open_subkey(policy.key)
        .map(|key| {
            let mut values: Vec<(String, String)> = key
                .enum_values()
                .filter_map(Result::ok)
                .map(|(name, value)| (name, value.to_string()))
                .collect();
            values.sort_by_key(|(name, _)| name.parse::<u32>().unwrap_or(u32::MAX));
            values
        })
        .unwrap_or_default();
    if current == policy.values {
        return;
    }
    let _ = hklm.delete_subkey_all(policy.key);
    if let Ok((key, _)) = hklm.create_subkey(policy.key) {
        for (name, value) in &policy.values {
            let _ = key.set_value(name, value);
        }
    }
}

/// Only SYSTEM and administrators may change the guard's folder; everyone
/// else can read it (the app reads nothing from it, but it does no harm).
pub fn protect_data_dir(dir: &Path) {
    let _ = Command::new("icacls")
        .arg(dir)
        .args([
            "/inheritance:r",
            "/grant:r",
            "*S-1-5-18:(OI)(CI)F",
            "*S-1-5-32-544:(OI)(CI)F",
            "*S-1-5-32-545:(OI)(CI)RX",
        ])
        .output();
}
