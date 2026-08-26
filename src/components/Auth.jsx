import { useState } from "react";
import { supabase } from "../supabase";
import "./Auth.css";

function Auth({ onLogin }) {
  const [isSignup, setIsSignup] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (isSignup && !cleanName) {
      alert("Please enter your name.");
      return;
    }

    if (!cleanEmail || !password) {
      alert("Please enter email and password.");
      return;
    }

    if (isSignup && password.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              name: cleanName,
              full_name: cleanName,
            },
          },
        });

        if (error) {
          alert(error.message);
          return;
        }

        if (!data.user) {
          alert("Account could not be created.");
          return;
        }

        if (!data.session) {
          alert(
            "Account created successfully!\n\nPlease check your email and confirm your account, then login."
          );

          setIsSignup(false);
          setPassword("");
          return;
        }

        const userName =
          data.user.user_metadata?.name ||
          data.user.user_metadata?.full_name ||
          cleanName ||
          data.user.email?.split("@")[0] ||
          "User";

        onLogin({
          id: data.user.id,
          name: userName,
          email: data.user.email,
        });

        return;
      }

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

      if (error) {
        alert(error.message);
        return;
      }

      if (!data.user) {
        alert("Login failed. Please try again.");
        return;
      }

      const userName =
        data.user.user_metadata?.name ||
        data.user.user_metadata?.full_name ||
        data.user.email?.split("@")[0] ||
        "User";

      onLogin({
        id: data.user.id,
        name: userName,
        email: data.user.email,
      });
    } catch (error) {
      console.error("Authentication error:", error);
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });

      if (error) {
        alert(error.message);
      }
    } catch (error) {
      console.error("Google login error:", error);
      alert("Google login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function switchAuthMode() {
    setIsSignup((previous) => !previous);
    setName("");
    setEmail("");
    setPassword("");
  }

  return (
    <div className="auth-page">
      <div className="auth-card">

        <div className="auth-logo">
          <span className="auth-play">▶</span>
          Bharat<span>Tube</span>
        </div>

        <h1>
          {isSignup
            ? "Create your account"
            : "Welcome back!"}
        </h1>

        <p className="auth-subtitle">
          {isSignup
            ? "Join BharatTube and start watching."
            : "Login to continue to BharatTube."}
        </p>

        <form onSubmit={handleSubmit}>

          {isSignup && (
            <div className="input-group">
              <label htmlFor="name">Name</label>

              <input
                id="name"
                type="text"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                disabled={loading}
              />
            </div>
          )}

          <div className="input-group">
            <label htmlFor="email">Email</label>

            <input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>

            <input
              id="password"
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                isSignup
                  ? "new-password"
                  : "current-password"
              }
              disabled={loading}
            />
          </div>

          <button
            className="auth-submit"
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Please wait..."
              : isSignup
              ? "Create Account"
              : "Login"}
          </button>
        </form>

        <div className="auth-divider">
          <span>OR</span>
        </div>

        <button
          className="google-btn"
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          <span className="google-letter">G</span>
          Continue with Google
        </button>

        <p className="switch-auth">
          {isSignup
            ? "Already have an account?"
            : "Don't have an account?"}

          <button
            type="button"
            onClick={switchAuthMode}
            disabled={loading}
          >
            {isSignup ? "Login" : "Sign up"}
          </button>
        </p>

      </div>
    </div>
  );
}

export default Auth;