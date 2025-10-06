import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Brain, BarChart3, Shield, Zap } from "lucide-react";

const Index = () => {
  const features = [
    {
      icon: <Brain className="h-6 w-6" />,
      title: "AI-Powered Analysis",
      description: "Advanced machine learning algorithms analyze market data and financial statements"
    },
    {
      icon: <BarChart3 className="h-6 w-6" />,
      title: "Real-Time Insights",
      description: "Get up-to-the-minute market analysis with streaming data and live research"
    },
    {
      icon: <Shield className="h-6 w-6" />,
      title: "Institutional Grade",
      description: "Professional-level research tools used by hedge funds and investment banks"
    },
    {
      icon: <Zap className="h-6 w-6" />,
      title: "Lightning Fast",
      description: "Process thousands of documents and data points in seconds, not hours"
    }
  ];

  return (
    <div className="min-h-screen finance-gradient">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center space-y-8">
            {/* Logo */}
            <div className="flex items-center justify-center mb-8">
              <div className="p-4 bg-accent/20 rounded-2xl finance-glow">
                <TrendingUp className="h-16 w-16 text-accent" />
              </div>
            </div>

            {/* Headline */}
            <div className="space-y-4">
              <h1 className="text-5xl md:text-7xl font-bold text-white">
                Deep Finance
                <span className="block finance-accent-gradient bg-clip-text text-transparent">
                  Research
                </span>
              </h1>
              <p className="text-xl md:text-2xl text-blue-200 max-w-3xl mx-auto">
                Professional AI-powered financial analysis platform. Get institutional-grade research, 
                real-time market insights, and comprehensive company analysis.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link to="/register">
                <Button size="lg" className="px-8 py-6 text-lg finance-bounce hover:finance-glow">
                  Start Free Research
                </Button>
              </Link>
              <Link to="/login">
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="px-8 py-6 text-lg border-white/20 text-white hover:bg-white/10 finance-transition"
                >
                  Sign In
                </Button>
              </Link>
            </div>

            {/* Trust Indicators */}
            <div className="pt-8">
              <p className="text-blue-300 text-sm uppercase tracking-wider">Trusted by professionals at</p>
              <div className="flex justify-center items-center space-x-8 mt-4 text-blue-200/60">
                <span className="text-lg font-semibold">Goldman Sachs</span>
                <span className="text-lg font-semibold">BlackRock</span>
                <span className="text-lg font-semibold">JP Morgan</span>
                <span className="text-lg font-semibold">Citadel</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-24 bg-background/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Professional Financial Intelligence
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Harness the power of AI to conduct deep financial research with institutional-grade tools and real-time market data.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="finance-shadow hover:finance-glow finance-transition border-border/50">
                <CardHeader>
                  <div className="p-2 bg-primary/10 rounded-lg w-fit text-primary">
                    {feature.icon}
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="py-16 bg-card border-t border-border">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <div className="space-y-6">
            <h3 className="text-2xl md:text-3xl font-bold">
              Ready to Transform Your Financial Research?
            </h3>
            <p className="text-lg text-muted-foreground">
              Join thousands of professionals who rely on Deep Finance Research for their investment decisions.
            </p>
            <Link to="/register">
              <Button size="lg" className="px-8 py-6 text-lg finance-bounce hover:finance-glow">
                Get Started Now
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
